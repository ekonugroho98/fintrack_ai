export const MESSAGES = {
  ERRORS: {
    INVALID_FORMAT: '❌ Format salah. Contoh: DAFTAR#Nama#role#fitur',
    ALREADY_REGISTERED: '❌ Nomor Anda sudah terdaftar.',
    INVALID_PHONE: '❌ Format nomor telepon tidak valid',
    INVALID_NAME: '❌ Nama harus antara 3-50 karakter',
    SERVER_ERROR: '❌ Terjadi kesalahan pada server'
  },
  SUCCESS: {
    REGISTER_SUCCESS: '✅ Pendaftaran berhasil, selamat datang {name}!',
    INVITE_SUCCESS: '✅ Nomor {number} berhasil diundang ke akun Anda.',
    TRANSACTION_SUCCESS: '✅ Transaksi berhasil dicatat!'
  }
};

export const VALIDATION = {
  PHONE_REGEX: /^[0-9]{10,15}$/,
  NAME_MIN_LENGTH: 3,
  NAME_MAX_LENGTH: 50
};
