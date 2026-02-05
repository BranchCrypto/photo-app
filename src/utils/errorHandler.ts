/**
 * 将技术性错误转换为用户友好的提示
 */
export function getUserFriendlyError(errorMsg: string): string {
  // 网络相关错误
  if (errorMsg.includes('NetworkError') || errorMsg.includes('network')) {
    return '网络连接异常，请检查网络后重试';
  }
  
  if (errorMsg.includes('timeout')) {
    return '操作超时，请稍后重试';
  }
  
  // 权限相关错误
  if (errorMsg.includes('permission') || errorMsg.includes('unauthorized') || errorMsg.includes('401')) {
    return '权限不足，请重新登录后重试';
  }
  
  if (errorMsg.includes('403')) {
    return '您没有执行此操作的权限';
  }
  
  // 文件相关错误
  if (errorMsg.includes('OSS') || errorMsg.includes('oss')) {
    return '云端文件服务异常，请稍后重试';
  }
  
  if (errorMsg.includes('file') || errorMsg.includes('upload')) {
    return '文件操作失败，请确认文件格式正确后重试';
  }
  
  // 数据库相关错误
  if (errorMsg.includes('database') || errorMsg.includes('DB')) {
    return '数据服务异常，请稍后重试';
  }
  
  // 特定业务错误
  if (errorMsg.includes('删除')) {
    return '删除操作失败，请稍后重试';
  }
  
  if (errorMsg.includes('登录')) {
    return '请先登录再进行操作';
  }
  
  // 默认情况
  return '操作失败，请稍后重试。如问题持续存在，请联系客服。';
}

/**
 * 显示用户友好的错误提示
 */
export function showError(message: string, setError: (msg: string) => void): void {
  const userFriendlyMsg = getUserFriendlyError(message);
  setError(userFriendlyMsg);
}