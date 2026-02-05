# delete-oss-file

通过阿里云 OSS REST API 删除单个文件，仅在权限校验通过后执行。

## 请求

- **Method**: `POST`
- **Headers**: `Authorization: Bearer <Supabase JWT>`, `Content-Type: application/json`
- **Body**: `{ "objectName": "bucket 内对象键，如 album-xxx/photo.jpg" }`

## 环境变量 / 密钥（Supabase Dashboard → Project Settings → Edge Functions → Secrets）

| 变量名 | 说明 |
|--------|------|
| `OSS_ACCESS_KEY_ID` | 阿里云 AccessKey ID |
| `OSS_ACCESS_KEY_SECRET` | 阿里云 AccessKey Secret |
| `OSS_BUCKET` | OSS Bucket 名称 |
| `OSS_REGION` | 地域，如 `oss-cn-hangzhou` |

## 权限

- 请求必须携带有效 Supabase JWT（登录用户）。
- 仅当 `supabase.auth.getUser(token)` 成功后才调用 OSS 删除。

## 响应

- **200**: `{ "ok": true, "objectName": "..." }`
- **204/200** 来自 OSS 均视为删除成功。
- **401**: 未提供或无效的 Authorization / 用户校验失败
- **400**: 缺少 `objectName`
- **502**: OSS 删除失败
- **500**: 服务端配置错误或异常
