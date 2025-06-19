/**
 * Middleware để set ngôn ngữ mặc định và helper functions
 */
const i18nMiddleware = (req, res, next) => {
    // Set default language nếu chưa có
    if (!req.language) {
        req.language = 'vi';
    }
    
    // Helper cho templates
    res.locals.t = req.t;
    res.locals.lng = req.language;
    res.locals.languages = ['vi', 'en'];
    
    // Helper function để format date theo ngôn ngữ
    res.locals.formatDate = (date, options = {}) => {
        if (!date) return '';
        
        const defaultOptions = { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        
        const formatOptions = { ...defaultOptions, ...options };
        const locale = req.language === 'vi' ? 'vi-VN' : 'en-US';
        
        return new Date(date).toLocaleDateString(locale, formatOptions);
    };
    
    // Helper function để format số theo ngôn ngữ
    res.locals.formatNumber = (number, options = {}) => {
        if (number === null || number === undefined) return '';
        
        const locale = req.language === 'vi' ? 'vi-VN' : 'en-US';
        return new Intl.NumberFormat(locale, options).format(number);
    };
    
    // Helper function để format phần trăm
    res.locals.formatPercent = (value, decimals = 1) => {
        if (value === null || value === undefined) return '0%';
        
        const locale = req.language === 'vi' ? 'vi-VN' : 'en-US';
        return new Intl.NumberFormat(locale, {
            style: 'percent',
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(value / 100);
    };
    
    // Helper function để format thời gian relative (vd: 2 giờ trước)
    res.locals.formatRelativeTime = (date) => {
        if (!date) return '';
        
        const now = new Date();
        const diffInMs = now - new Date(date);
        const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
        const diffInHours = Math.floor(diffInMinutes / 60);
        const diffInDays = Math.floor(diffInHours / 24);
        
        if (req.language === 'vi') {
            if (diffInMinutes < 1) return 'Vừa xong';
            if (diffInMinutes < 60) return `${diffInMinutes} phút trước`;
            if (diffInHours < 24) return `${diffInHours} giờ trước`;
            if (diffInDays < 7) return `${diffInDays} ngày trước`;
            return res.locals.formatDate(date, { month: 'short', day: 'numeric' });
        } else {
            if (diffInMinutes < 1) return 'Just now';
            if (diffInMinutes < 60) return `${diffInMinutes} minutes ago`;
            if (diffInHours < 24) return `${diffInHours} hours ago`;
            if (diffInDays < 7) return `${diffInDays} days ago`;
            return res.locals.formatDate(date, { month: 'short', day: 'numeric' });
        }
    };
    
    // Helper function để pluralize (số nhiều)
    res.locals.pluralize = (count, singularKey, pluralKey) => {
        if (req.language === 'vi') {
            // Tiếng Việt không có số nhiều
            return req.t(singularKey);
        } else {
            // Tiếng Anh có số nhiều
            return count === 1 ? req.t(singularKey) : req.t(pluralKey);
        }
    };
    
    // Helper function để get language name
    res.locals.getLanguageName = (langCode) => {
        const languageNames = {
            vi: req.language === 'vi' ? 'Tiếng Việt' : 'Vietnamese',
            en: req.language === 'vi' ? 'Tiếng Anh' : 'English'
        };
        return languageNames[langCode] || langCode;
    };
    
    // Helper function để check active language
    res.locals.isActiveLanguage = (langCode) => {
        return req.language === langCode;
    };
    
    // Helper function để build URL with language parameter
    res.locals.buildLangUrl = (langCode) => {
        const url = new URL(req.originalUrl, `http://${req.get('host')}`);
        url.searchParams.set('lng', langCode);
        return url.pathname + url.search;
    };
    
    next();
};

/**
 * Middleware để xử lý chuyển đổi ngôn ngữ
 */
const languageSwitchMiddleware = (req, res, next) => {
    // Nếu có query parameter lng, set cookie và redirect
    if (req.query.lng && ['vi', 'en'].includes(req.query.lng)) {
        // Set cookie để lưu ngôn ngữ
        res.cookie('i18next', req.query.lng, {
            maxAge: 365 * 24 * 60 * 60 * 1000, // 1 năm
            httpOnly: false, // Cho phép JS access để i18next có thể đọc
            secure: false, // Set true nếu dùng HTTPS
            sameSite: 'lax'
        });
        
        // Redirect về URL không có lng parameter
        const url = new URL(req.originalUrl, `http://${req.get('host')}`);
        url.searchParams.delete('lng');
        const cleanUrl = url.pathname + (url.search || '');
        
        return res.redirect(cleanUrl);
    }
    
    next();
};

/**
 * Helper function để render với ngôn ngữ (sử dụng trong controller)
 */
const renderWithLang = (req, res, template, data = {}) => {
    res.render(template, {
        ...data,
        lng: req.language,
        title: data.title || req.t('common:app_name')
    });
};

/**
 * Helper function để flash message với ngôn ngữ (sử dụng trong controller)
 */
const flashMessage = (req, type, messageKey, options = {}) => {
    const message = req.t(messageKey, options);
    req.flash(type, message);
};

/**
 * Helper function để validate và format input theo ngôn ngữ
 */
const validateAndFormatInput = (req, data) => {
    // Validate required fields
    const errors = [];
    
    if (data.requiredFields) {
        data.requiredFields.forEach(field => {
            if (!data.values[field] || data.values[field].trim() === '') {
                errors.push({
                    field: field,
                    message: req.t('validation:required', { field: req.t(`common:${field}`) })
                });
            }
        });
    }
    
    // Format text fields based on language
    if (data.values) {
        Object.keys(data.values).forEach(key => {
            if (typeof data.values[key] === 'string') {
                data.values[key] = data.values[key].trim();
            }
        });
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors,
        values: data.values
    };
};

/**
 * Helper function để format error messages
 */
const formatErrorMessage = (req, error) => {
    // Check if error has translation key
    if (error.translationKey) {
        return req.t(error.translationKey, error.params || {});
    }
    
    // Default error message
    if (error.message) {
        return error.message;
    }
    
    return req.t('common:error');
};

/**
 * Middleware để handle errors với đa ngôn ngữ
 */
const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);
    
    // Determine error message
    let errorMessage = formatErrorMessage(req, err);
    
    // Set appropriate status code
    const statusCode = err.statusCode || err.status || 500;
    
    // If it's an API request, return JSON
    if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(statusCode).json({
            success: false,
            message: errorMessage,
            ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
        });
    }
    
    // For web requests, render error page
    res.status(statusCode).render('error', {
        title: req.t('common:error'),
        message: errorMessage,
        statusCode: statusCode,
        lng: req.language,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = {
    i18nMiddleware,
    languageSwitchMiddleware,
    renderWithLang,
    flashMessage,
    validateAndFormatInput,
    formatErrorMessage,
    errorHandler
};