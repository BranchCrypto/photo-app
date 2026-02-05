// Supabase Edge Function: delete-oss-file
// 接收 objectName，校验权限后通过阿里云 OSS REST API 删除文件

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// [安全] CORS 配置：限制允许的来源
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").filter(Boolean);

function getCorsHeaders(origin: string | null): Record<string, string> {
  // 如果未配置 ALLOWED_ORIGINS，则允许所有来源（开发环境）
  // 生产环境应配置具体域名，如 "https://your-app.com,http://localhost:5173"
  const allowedOrigin = ALLOWED_ORIGINS.length === 0 
    ? "*" 
    : (origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function signOssV1(
  accessKeySecret: string,
  verb: string,
  contentMd5: string,
  contentType: string,
  date: string,
  canonicalizedResource: string,
): Promise<string> {
  const stringToSign = [
    verb,
    contentMd5,
    contentType,
    date,
    canonicalizedResource,
  ].join("\n");

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(accessKeySecret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(stringToSign),
  );
  return arrayBufferToBase64(signature);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = getCorsHeaders(origin);

  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "未提供或无效的 Authorization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ error: "服务端配置错误" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 使用用户 token 创建客户端进行身份验证
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(
      authHeader.replace(/^Bearer\s+/i, "").trim(),
    );

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "权限校验失败，请先登录" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 使用 service_role key 创建管理客户端，绑过 RLS 进行权限查询
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey);

    const body = await req.json().catch(() => ({})) as { objectName?: string };
    const objectName = typeof body?.objectName === "string" ? body.objectName.trim() : "";

    if (!objectName) {
      return new Response(
        JSON.stringify({ error: "缺少参数 objectName" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // [安全] 路径校验：防止路径遍历攻击
    // 禁止 ".." 路径穿越，但允许中文、字母、数字、常见符号
    if (objectName.includes("..") || objectName.includes("\\") || /[\x00-\x1f]/.test(objectName)) {
      return new Response(
        JSON.stringify({ error: "非法的 objectName 格式" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // [安全] 业务鉴权：验证用户对该文件的删除权限
    // 查询 photos 表，确认该文件存在且用户有权限删除
    const { data: photoRecord, error: photoQueryError } = await supabaseAdmin
      .from("photos")
      .select("id, album_id, user_id")
      .eq("oss_path", objectName)
      .maybeSingle();

    if (photoQueryError) {
      console.error("查询 photos 表失败:", photoQueryError);
      return new Response(
        JSON.stringify({ error: "权限校验失败" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!photoRecord) {
      return new Response(
        JSON.stringify({ error: "未找到对应的照片记录，无法删除" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 检查用户是否是照片上传者，或者是相册成员（owner/editor）
    const isUploader = photoRecord.user_id === user.id;

    let hasAlbumPermission = false;
    if (!isUploader && photoRecord.album_id) {
      const { data: memberRecord } = await supabaseAdmin
        .from("album_members")
        .select("role")
        .eq("album_id", photoRecord.album_id)
        .eq("user_id", user.id)
        .maybeSingle();

      // owner 和 editor 都可以删除相册内的照片
      hasAlbumPermission = memberRecord?.role === "owner" || memberRecord?.role === "editor";
    }

    if (!isUploader && !hasAlbumPermission) {
      return new Response(
        JSON.stringify({ error: "无权删除该文件" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const accessKeyId = Deno.env.get("OSS_ACCESS_KEY_ID");
    const accessKeySecret = Deno.env.get("OSS_ACCESS_KEY_SECRET");
    const bucket = Deno.env.get("OSS_BUCKET");
    const region = Deno.env.get("OSS_REGION");

    if (!accessKeyId || !accessKeySecret || !bucket || !region) {
      return new Response(
        JSON.stringify({ error: "服务端 OSS 未配置" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const host = `${bucket}.${region}.aliyuncs.com`;
    const date = new Date().toUTCString();
    const canonicalizedResource = `/${bucket}/${objectName}`;

    const signature = await signOssV1(
      accessKeySecret,
      "DELETE",
      "",
      "",
      date,
      canonicalizedResource,
    );

    const url = `https://${host}/${encodeURI(objectName).replace(/^\/+/, "")}`;

    const ossResp = await fetch(url, {
      method: "DELETE",
      headers: {
        Host: host,
        Date: date,
        Authorization: `OSS ${accessKeyId}:${signature}`,
      },
    });

    if (ossResp.status !== 204 && ossResp.status !== 200) {
      const text = await ossResp.text();
      console.error("OSS DELETE failed:", ossResp.status, text);
      return new Response(
        JSON.stringify({ error: "OSS 删除失败", detail: text.slice(0, 200) }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // [原子性] OSS 删除成功后，同时删除数据库记录
    const { error: deleteDbError } = await supabaseAdmin
      .from("photos")
      .delete()
      .eq("id", photoRecord.id);

    if (deleteDbError) {
      console.error("数据库删除失败:", deleteDbError);
      // OSS 已删除但数据库删除失败，记录日志但仍返回部分成功
      return new Response(
        JSON.stringify({ ok: true, objectName, warning: "OSS 已删除，但数据库记录删除失败" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("OSS 文件及数据库记录删除成功:", { objectName, photoId: photoRecord.id, user_id: user.id });
    return new Response(
      JSON.stringify({ ok: true, objectName, photoId: photoRecord.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("delete-oss-file error:", e);
    return new Response(
      JSON.stringify({ error: "服务器错误", message: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
