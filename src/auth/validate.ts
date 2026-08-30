export const LOGIN_ID_RE = /^[a-zA-Z0-9_]{4,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateLoginId(value: string) {
  if (!LOGIN_ID_RE.test(value)) {
    return '아이디는 영문, 숫자, _ 4~20자입니다.';
  }
  return null;
}

export function validateEmail(value: string) {
  if (!EMAIL_RE.test(value.trim().toLowerCase())) {
    return '올바른 이메일을 입력해 주세요.';
  }
  return null;
}

export function validatePassword(value: string) {
  if (value.length < 8 || value.length > 72) {
    return '비밀번호는 8자 이상이어야 합니다.';
  }
  return null;
}
