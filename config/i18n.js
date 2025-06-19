const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const middleware = require('i18next-http-middleware');
const path = require('path');

i18next
  .use(Backend)
  .use(middleware.LanguageDetector)
  .init({
    lng: 'vi', // Ngôn ngữ mặc định
    fallbackLng: 'vi',
    backend: {
      loadPath: path.join(__dirname, '../locales/{{lng}}/{{ns}}.json')
    },
    ns: ['common', 'auth', 'quiz', 'test', 'validation', 'error'],
    defaultNS: 'common',
    detection: {
      order: ['querystring', 'cookie', 'header'],
      caches: ['cookie'],
      lookupQuerystring: 'lng',
      lookupCookie: 'i18next',
      cookieSecure: false,
      cookieExpirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 năm
    }
  });

module.exports = i18next;