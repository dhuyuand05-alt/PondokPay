export const validatePassword = (password) => {
  if (typeof password !== 'string' || Buffer.byteLength(password, 'utf8') < 12) {
    return 'Password harus terdiri dari minimal 12 byte.';
  }
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return 'Password tidak boleh melebihi 72 byte.';
  }
  return null;
};
