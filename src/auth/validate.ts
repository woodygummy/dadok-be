export const LOGIN_ID_RE = /^[a-zA-Z0-9_]{4,20}$/;
const LOGIN_ID_CHARS = /^[a-zA-Z0-9_]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLoginId(value: string) {
  if (!value) return '아이디를 입력해 주세요.';
  if (value.length < 4) {
    return `아이디는 4자 이상이어야 합니다. 지금은 ${value.length}자입니다.`;
  }
  if (value.length > 20) {
    return `아이디는 20자 이하여야 합니다. 지금은 ${value.length}자입니다.`;
  }
  if (!LOGIN_ID_CHARS.test(value)) {
    return '아이디는 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.';
  }
  if (!LOGIN_ID_RE.test(value)) {
    return '아이디는 영문, 숫자, 밑줄(_) 4~20자입니다.';
  }
  return null;
}

export function validateEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (!email) return '이메일을 입력해 주세요.';
  if (!email.includes('@')) {
    return '이메일 형식이 올바르지 않습니다. @를 포함해 주세요. 예: name@example.com';
  }
  if (!EMAIL_RE.test(email)) {
    return '이메일 형식이 올바르지 않습니다. 예: name@example.com';
  }
  return null;
}

export function validatePassword(value: string) {
  if (!value) return '비밀번호를 입력해 주세요.';
  if (value.length < 8) {
    return `비밀번호는 8자 이상이어야 합니다. 지금은 ${value.length}자입니다.`;
  }
  if (value.length > 72) {
    return `비밀번호는 72자 이하여야 합니다. 지금은 ${value.length}자입니다.`;
  }
  return null;
}
