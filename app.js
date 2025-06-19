const express = require("express");
const expressLayouts = require("express-ejs-layouts");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const path = require("path");
const http = require("http");
const socketIo = require("socket.io");
const app = express();

// Create HTTP server and Socket.IO
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const connectDB = require("./config/db.mongdb.cloud");
const multer = require("multer");

// Import i18n-enabled services
const AuthService = require("./services/auth.service");
const PlayerService = require("./services/player.service");
const QuizService = require("./services/quiz.service");
const TestService = require("./services/test.service");

const TestSocketHandler = require("./sockets/test.socket");
const i18next = require("./config/i18n");
const i18nextMiddleware = require("i18next-http-middleware");

// Import i18n middleware
const {
  i18nMiddleware,
  languageSwitchMiddleware,
  errorHandler,
} = require("./middlewares/i18n.middleware");

require("dotenv").config();

// Body parser middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session configuration
app.use(
  session({
    secret:
      process.env.SESSION_SECRET || "quiz-app-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      touchAfter: 24 * 3600, // lazy session update
    }),
    cookie: {
      secure: false, // Set to true if using HTTPS
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24, // 24 hours
    },
  })
);

// IMPORTANT: i18n middleware setup
app.use(i18nextMiddleware.handle(i18next));
app.use(languageSwitchMiddleware); // Handle language switching
app.use(i18nMiddleware); // Enhanced i18n helpers

// Make user available in all templates
app.use((req, res, next) => {
  res.locals.user = req.session ? req.session.user : null;

  // Additional i18n helpers for templates (enhanced by i18nMiddleware)
  res.locals.t = req.t;
  res.locals.lng = req.language;
  res.locals.languages = ["vi", "en"];

  // Enhanced translation function with interpolation
  res.locals.ti = function (key, options = {}) {
    let translation = req.t(key);

    // Simple interpolation
    if (options && typeof options === "object") {
      Object.keys(options).forEach((placeholder) => {
        const regex = new RegExp(`{{${placeholder}}}`, "g");
        translation = translation.replace(regex, options[placeholder]);
      });
    }

    return translation;
  };

  next();
});

// EJS setup
app.use(expressLayouts);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.set("layout", "layouts/main");

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Initialize Socket.IO for real-time tests
const testSocketHandler = new TestSocketHandler(io);

// Connect to MongoDB and create initial admin user
connectDB().then(async () => {
  try {
    // Create initial admin and demo users using i18n-enabled service
    const defaultTranslate = (key, options = {}) => {
      let message = key;
      Object.keys(options).forEach((placeholder) => {
        message = message.replace(`{{${placeholder}}}`, options[placeholder]);
      });
      return message;
    };

    await AuthService.createInitialAdmin(defaultTranslate);

    // Start test cleanup scheduler
    console.log("🧹 Starting test cleanup scheduler...");
    setInterval(async () => {
      try {
        const cleanedCount = 0; // await TestService.cleanupExpiredTests();
        if (cleanedCount > 0) {
          console.log(`🧹 Cleaned up ${cleanedCount} expired tests`);
        }
      } catch (error) {
        console.error("Test cleanup error:", error);
      }
    }, 60 * 60 * 1000); // Run every hour
  } catch (error) {
    console.error("❌ Error setting up initial users:", error);
  }
});

// Routes
const quizRoutes = require("./routes/quiz.route");
const authRoutes = require("./routes/auth.route");
const testRoutes = require("./routes/test.route");
const { requireAuth, requireAdmin } = require("./controllers/auth.controller");

// Auth routes (no middleware needed)
app.use("/auth", authRoutes);

// Test routes (public and authenticated)
app.use("/test", testRoutes);

// Quiz operation logging middleware
app.use("/quizzes", (req, res, next) => {
  const user = req.session?.user;
  const operation = `${req.method} ${req.path}`;

  // Log quiz operations for audit trail
  if (user && ["POST", "PUT", "DELETE"].includes(req.method)) {
    console.log(
      `Quiz Operation: ${operation} by ${
        user.email
      } at ${new Date().toISOString()}`
    );
  }

  next();
});

// Protected routes (require authentication AND admin role)
app.use("/quizzes", requireAuth, requireAdmin, quizRoutes);

// ========================================
// ENHANCED API ROUTES FOR QUIZ MANAGEMENT WITH I18N
// ========================================

// Enhanced Analytics API with i18n
app.get(
  "/api/quizzes/analytics",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    try {
      // Use QuizService with translation function
      const analytics = await QuizService.getQuizAnalytics(
        req.session?.selectedRoom?.code,
        req.t
      );

      // Additional real-time calculations
      const quizzes = await QuizService.getAllQuizzes(req.t);
      const enhancedAnalytics = {
        ...analytics,
        realTime: {
          totalQuizzes: quizzes.length,
          totalQuestions: quizzes.reduce(
            (sum, q) => sum + q.questions.length,
            0
          ),
          totalParticipants: quizzes.reduce(
            (sum, q) => sum + (q.totalCount || 0),
            0
          ),
          byMode: {
            online: quizzes.filter((q) => q.mode === "online").length,
            offline: quizzes.filter((q) => q.mode === "offline").length,
          },
          recentActivity: quizzes.filter((q) => {
            const daysDiff = Math.floor(
              (new Date() - new Date(q.updatedAt)) / (1000 * 60 * 60 * 24)
            );
            return daysDiff <= 7;
          }).length,
          averageQuestionsPerQuiz:
            quizzes.length > 0
              ? Math.round(
                  quizzes.reduce((sum, q) => sum + q.questions.length, 0) /
                    quizzes.length
                )
              : 0,
          mostPopularMode:
            quizzes.filter((q) => q.mode === "online").length >
            quizzes.filter((q) => q.mode === "offline").length
              ? "online"
              : "offline",
        },
      };

      res.json({
        success: true,
        analytics: enhancedAnalytics,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Analytics error:", error);
      res.status(500).json({
        success: false,
        message: req.t("quiz:failed_fetch_analytics"),
      });
    }
  }
);

// Refresh Quiz Data API with i18n
app.get("/api/quizzes/refresh", requireAuth, requireAdmin, async (req, res) => {
  try {
    // Use QuizService with translation function
    const quizzes = await QuizService.getAllQuizzes(req.t);

    // Simulate some processing time for refresh effect
    await new Promise((resolve) => setTimeout(resolve, 1000));

    res.json({
      success: true,
      message: req.t("quiz:quizzes_refreshed"),
      count: quizzes.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Refresh error:", error);
    res.status(500).json({
      success: false,
      message: req.t("quiz:failed_refresh_quiz_data"),
    });
  }
});

// Advanced Search API with i18n
app.get("/api/quizzes/search", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { q, mode, language, status, sortBy, limit = 50 } = req.query;

    // Use QuizService search with translation function
    const searchParams = {
      query: q,
      mode,
      language,
      sortBy,
      roomCode: req.session?.selectedRoom?.code,
    };

    let quizzes = await QuizService.searchQuizzes(searchParams, req.t);

    // Apply limit
    quizzes = quizzes.slice(0, parseInt(limit));

    res.json({
      success: true,
      quizzes: quizzes,
      total: quizzes.length,
      filters: { q, mode, language, status, sortBy },
    });
  } catch (error) {
    console.error("Search error:", error);
    res.status(500).json({
      success: false,
      message: req.t("quiz:failed_search_quizzes"),
    });
  }
});

// Bulk Operations API with i18n
app.post("/api/quizzes/bulk", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { action, quizIds } = req.body;

    if (!action || !quizIds || !Array.isArray(quizIds)) {
      return res.status(400).json({
        success: false,
        message: req.t("validation:invalid_request"),
      });
    }

    let results = [];

    switch (action) {
      case "delete":
        for (const quizId of quizIds) {
          try {
            await QuizService.deleteQuiz(quizId, req.t);
            results.push({ quizId, success: true });
          } catch (error) {
            results.push({ quizId, success: false, error: error.message });
          }
        }
        break;

      case "duplicate":
        for (const quizId of quizIds) {
          try {
            const originalQuiz = await QuizService.getQuiz(quizId, req.t);
            const copyLabel = req.t("quiz:copy");
            const duplicateData = {
              quizInfo: JSON.stringify({
                title: `${originalQuiz.title} (${copyLabel})`,
                mode: originalQuiz.mode,
                roomCode: originalQuiz.roomCode,
                scheduleSettings: originalQuiz.scheduleSettings,
              }),
              questionsData: JSON.stringify(
                originalQuiz.questions.map((q, index) => ({
                  number: index + 1,
                  content: q.content,
                  answerTime: q.answerTime || 30,
                  options: q.options || [],
                  correctAnswer: q.correctAnswer || [],
                }))
              ),
            };
            const duplicate = await QuizService.createQuiz(
              duplicateData,
              null,
              req.t
            );
            results.push({ quizId, success: true, newQuizId: duplicate._id });
          } catch (error) {
            results.push({ quizId, success: false, error: error.message });
          }
        }
        break;

      default:
        return res.status(400).json({
          success: false,
          message: req.t("validation:operation_failed"),
        });
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    res.json({
      success: true,
      message: req.t("quiz:bulk_operation_completed", {
        action: action,
        successful: successCount,
        failed: failureCount,
      }),
      results: results,
      summary: {
        total: results.length,
        successful: successCount,
        failed: failureCount,
      },
    });
  } catch (error) {
    console.error("Bulk operation error:", error);
    res.status(500).json({
      success: false,
      message: req.t("validation:operation_failed"),
    });
  }
});

// ========================================
// ROOT ROUTE WITH I18N
// ========================================
app.get("/", (req, res) => {
  if (req.session && req.session.user) {
    // Redirect based on role
    if (req.session.user.role === "admin") {
      res.redirect("/quizzes");
    } else if (req.session.user.role === "player") {
      res.redirect("/player/dashboard");
    } else {
      res.redirect("/auth/login");
    }
  } else {
    res.redirect("/auth/login");
  }
});

// ========================================
// ENHANCED PLAYER ROUTES WITH I18N
// ========================================
app.get("/player/dashboard", requireAuth, async (req, res) => {
  if (req.session.user.role !== "player") {
    return res.redirect("/quizzes");
  }

  try {
    const user = req.session.user;

    // Fetch player statistics using service
    const stats = await PlayerService.getPlayerStats(user.id);
    const recentQuizzes = await PlayerService.getRecentQuizzes(user.id, 5);
    const achievements = await PlayerService.getPlayerAchievements(user.id);

    // Additional dashboard data
    const dashboardData = {
      welcomeMessage: getWelcomeMessage(req.t),
      quickActions: getQuickActions(req.t),
      notifications: [],
      upcomingQuizzes: [],
    };

    res.render("player/dashboard", {
      title: req.t("common:dashboard"),
      user: user,
      stats: stats,
      recentQuizzes: recentQuizzes,
      achievements: achievements,
      dashboardData: dashboardData,
      lng: req.language,
      t: req.t,
      ti: res.locals.ti,
      formatDate: res.locals.formatDate,
      formatNumber: res.locals.formatNumber,
      layout: false,
    });
  } catch (error) {
    console.error("Player dashboard error:", error);
    res.status(500).render("error/500", {
      title: req.t("error:server_error"),
      message: req.t("error:server_error_desc"),
      lng: req.language,
      layout: false,
    });
  }
});

// Player join quiz route with i18n
app.get("/player/join-quiz", requireAuth, (req, res) => {
  if (req.session.user.role !== "player") {
    return res.redirect("/quizzes");
  }

  const user = req.session.user;
  res.send(`
<!DOCTYPE html>
<html lang="${req.language || "en"}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${req.t("test:join_test")} - ${req.t("common:app_name")}</title>
    
    <!-- Bootstrap CSS -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
    
    <!-- Google Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    
    <!-- Font Awesome -->
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    
    <!-- SweetAlert2 CSS -->
    <link href="https://cdn.jsdelivr.net/npm/@sweetalert2/theme-bootstrap-4/bootstrap-4.css" rel="stylesheet">
    
    <style>
        :root {
            --primary-color: #667eea;
            --secondary-color: #764ba2;
            --success-color: #10b981;
            --border-radius: 12px;
            --shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
            --shadow-lg: 0 20px 40px rgba(0, 0, 0, 0.1);
        }

        * {
            font-family: 'Inter', sans-serif;
        }

        body {
            background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .join-quiz-container {
            width: 100%;
            max-width: 480px;
            margin: 0 auto;
        }

        .quiz-card {
            background: white;
            border-radius: var(--border-radius);
            box-shadow: var(--shadow-lg);
            border: none;
            overflow: hidden;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }

        .quiz-card:hover {
            transform: translateY(-5px);
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
        }

        .card-header {
            background: linear-gradient(135deg, var(--primary-color) 0%, var(--secondary-color) 100%);
            color: white;
            text-align: center;
            padding: 2rem 1.5rem;
            border: none;
        }

        .header-icon {
            width: 60px;
            height: 60px;
            background: rgba(255, 255, 255, 0.2);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 1rem;
            font-size: 1.5rem;
        }

        .card-title {
            font-size: 1.75rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
            letter-spacing: -0.025em;
        }

        .card-subtitle {
            font-size: 1rem;
            opacity: 0.9;
            font-weight: 400;
            line-height: 1.5;
        }

        .card-body {
            padding: 2rem 1.5rem;
        }

        .form-floating {
            margin-bottom: 1.5rem;
        }

        .form-control {
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            padding: 1rem 0.75rem;
            font-size: 1rem;
            transition: all 0.3s ease;
            background-color: #f8fafc;
        }

        .form-control:focus {
            background-color: white;
            border-color: var(--primary-color);
            box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
        }

        .form-floating > label {
            color: #64748b;
            font-weight: 500;
        }

        .pin-code-input {
            text-align: center;
            font-size: 1.25rem;
            font-weight: 600;
            letter-spacing: 0.5rem;
            padding-left: 1.5rem;
        }

        .btn-start-quiz {
            background: linear-gradient(135deg, var(--success-color) 0%, #059669 100%);
            border: none;
            border-radius: 8px;
            padding: 1rem 2rem;
            font-size: 1.1rem;
            font-weight: 600;
            color: white;
            width: 100%;
            transition: all 0.3s ease;
            box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
        }

        .btn-start-quiz:hover {
            background: linear-gradient(135deg, #059669 0%, #047857 100%);
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(16, 185, 129, 0.4);
            color: white;
        }

        .user-info {
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            border: 1px solid #fbbf24;
            border-radius: 8px;
            padding: 1rem;
            margin-bottom: 1.5rem;
            text-align: center;
        }

        .user-info .user-name {
            font-weight: 600;
            color: #f59e0b;
            margin-bottom: 0.25rem;
        }

        .footer-links {
            text-align: center;
            margin-top: 1.5rem;
            padding-top: 1.5rem;
            border-top: 1px solid #e2e8f0;
        }

        .footer-links a {
            color: var(--primary-color);
            text-decoration: none;
            font-size: 0.9rem;
            margin: 0 1rem;
            transition: color 0.3s ease;
        }

        .footer-links a:hover {
            color: var(--secondary-color);
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="join-quiz-container">
        <div class="card quiz-card">
            <div class="card-header">
                <div class="header-icon">
                    <i class="fas fa-gamepad"></i>
                </div>
                <h1 class="card-title">${req.t("test:join_test")}</h1>
                <p class="card-subtitle">${req.t("test:enter_name_to_join")}</p>
            </div>
            
            <div class="card-body">
                <div class="user-info">
                    <div class="user-name">
                        <i class="fas fa-user-circle me-2"></i>
                        ${req.t("common:welcome")}, ${user.name}!
                    </div>
                    <div class="user-email">${user.email}</div>
                </div>

                <form id="joinTestForm" action="/test/join" method="POST">
                    <div class="form-floating">
                        <input type="text" 
                               class="form-control pin-code-input" 
                               id="testCode" 
                               name="testCode"
                               placeholder="000000" 
                               maxlength="6"
                               pattern="[0-9]{6}"
                               required>
                        <label for="testCode">
                            <i class="fas fa-key me-2"></i>${req.t(
                              "test:test_code"
                            )}
                        </label>
                    </div>

                    <button type="submit" class="btn btn-start-quiz" id="startTestBtn">
                        <i class="fas fa-play me-2"></i>
                        ${req.t("test:join_test")}
                    </button>
                </form>

                <div class="footer-links">
                    <a href="/player/dashboard">
                        <i class="fas fa-home me-1"></i>${req.t(
                          "common:dashboard"
                        )}
                    </a>
                    <a href="/auth/logout">
                        <i class="fas fa-sign-out-alt me-1"></i>${req.t(
                          "common:logout"
                        )}
                    </a>
                </div>
            </div>
        </div>
    </div>

    <!-- Bootstrap JS -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
    
    <!-- SweetAlert2 JS -->
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const form = document.getElementById('joinTestForm');
            const codeInput = document.getElementById('testCode');
            const startTestBtn = document.getElementById('startTestBtn');

            codeInput.addEventListener('input', function(e) {
                let value = e.target.value.replace(/\\D/g, '');
                if (value.length > 6) {
                    value = value.slice(0, 6);
                }
                e.target.value = value;
            });

            function validateForm() {
                const testCode = codeInput.value;
                const isValid = testCode.length === 6;
                startTestBtn.disabled = !isValid;
                return isValid;
            }

            codeInput.addEventListener('input', validateForm);
            validateForm();

            form.addEventListener('submit', function(e) {
                e.preventDefault();
                
                if (!validateForm()) {
                    Swal.fire({
                        icon: 'error',
                        title: '${req.t("validation:invalid_request")}',
                        text: '${req.t("validation:test_code_invalid")}',
                        confirmButtonColor: '#667eea'
                    });
                    return;
                }

                const originalContent = startTestBtn.innerHTML;
                startTestBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>${req.t(
                  "test:preparing"
                )}';
                startTestBtn.disabled = true;

                fetch('/test/join', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        testCode: codeInput.value
                    })
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        window.location.href = data.redirectUrl;
                    } else {
                        Swal.fire({
                            icon: 'error',
                            title: '${req.t("common:error")}',
                            text: data.message,
                            confirmButtonColor: '#667eea'
                        });
                    }
                })
                .catch(error => {
                    Swal.fire({
                        icon: 'error',
                        title: '${req.t("common:error")}',
                        text: '${req.t("validation:network_error")}',
                        confirmButtonColor: '#667eea'
                    });
                })
                .finally(() => {
                    startTestBtn.innerHTML = originalContent;
                    startTestBtn.disabled = false;
                });
            });
        });
    </script>
</body>
</html>
    `);
});

// Player join quiz POST route with i18n
app.post("/player/join-quiz", requireAuth, async (req, res) => {
  try {
    const { testCode } = req.body;

    // Validate input
    if (!testCode || testCode.toString().length !== 6) {
      return res.status(400).json({
        success: false,
        message: req.t("validation:test_code_invalid"),
      });
    }

    // Redirect to test join page
    res.json({
      success: true,
      message: req.t("test:redirecting_to_room"),
      redirectUrl: `/test/join/${testCode}`,
    });
  } catch (error) {
    console.error("Join test error:", error);
    res.status(500).json({
      success: false,
      message: req.t("test:join_error"),
    });
  }
});

// Additional player routes with i18n
app.get("/player/history", requireAuth, (req, res) => {
  if (req.session.user.role !== "player") {
    return res.redirect("/quizzes");
  }

  res.send(`
        <!DOCTYPE html>
        <html lang="${req.language || "en"}"><head><title>${req.t(
    "test:test_history"
  )}</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
        </head><body class="bg-light">
        <div class="container mt-5 text-center">
            <h1>🚧 ${req.t("test:test_history")}</h1>
            <p class="lead">${req.t("common:feature_coming_soon")}</p>
            <a href="/player/dashboard" class="btn btn-primary">${req.t(
              "common:back_home"
            )}</a>
        </div></body></html>
    `);
});

// API endpoints for player stats with i18n
app.get("/api/player/stats", requireAuth, async (req, res) => {
  if (req.session.user.role !== "player") {
    return res.status(403).json({
      error: req.t("error:access_denied"),
    });
  }

  try {
    const stats = await PlayerService.getPlayerStats(req.session.user.id);
    res.json({ success: true, stats: stats });
  } catch (error) {
    console.error("API stats error:", error);
    res.status(500).json({
      error: req.t("error:server_error"),
    });
  }
});

// ========================================
// HELPER FUNCTIONS WITH I18N SUPPORT
// ========================================
function getWelcomeMessage(t) {
  const hour = new Date().getHours();

  if (hour < 12) {
    return t("player:good_morning");
  } else if (hour < 17) {
    return t("player:good_afternoon");
  } else {
    return t("player:good_evening");
  }
}

function getQuickActions(t) {
  return [
    {
      name: t("test:join_test"),
      icon: "fas fa-play",
      url: "/player/join-quiz",
      description: t("test:enter_code"),
      primary: true,
    },
    {
      name: t("test:test_history"),
      icon: "fas fa-chart-line",
      url: "/player/history",
      description: t("player:see_performance"),
    },
    {
      name: t("test:leaderboard"),
      icon: "fas fa-trophy",
      url: "/player/leaderboard",
      description: t("player:check_ranking"),
    },
  ];
}

// ========================================
// ERROR HANDLING MIDDLEWARE WITH I18N
// ========================================
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        error: req.t("validation:file_size_limit", { max: 5 }),
      });
    }
  }
  next(error);
});

// Global error handler with i18n support
app.use(errorHandler);

// 404 handler with i18n
app.use((req, res) => {
  res.status(404).send(`
        <!DOCTYPE html>
        <html lang="${req.language || "en"}">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>404 - ${req.t("error:page_not_found")}</title>
            <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
            <style>
                body { 
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    min-height: 100vh;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-family: 'Inter', sans-serif;
                }
                .error-container { text-align: center; }
                .error-code { font-size: 5rem; font-weight: bold; margin-bottom: 1rem; }
                .btn-home { 
                    background: rgba(255,255,255,0.2);
                    border: 2px solid white;
                    color: white;
                    padding: 0.75rem 2rem;
                    border-radius: 50px;
                    text-decoration: none;
                    margin-top: 2rem;
                    display: inline-block;
                }
                .btn-home:hover { background: white; color: #667eea; }
            </style>
        </head>
        <body>
            <div class="error-container">
                <div class="error-code">404</div>
                <h2>${req.t("error:page_not_found")}</h2>
                <p>${req.t("error:page_not_found_desc")}</p>
                <a href="/" class="btn-home">${req.t("common:go_home")}</a>
            </div>
        </body>
        </html>
    `);
});

// ========================================
// SERVER STARTUP WITH I18N MESSAGES
// ========================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running at http://112.213.87.91/`);
  console.log(`🔌 Socket.IO server ready for real-time tests`);
  console.log(`🌍 i18n support enabled (Vietnamese/English)`);
  console.log(`\n👤 Demo credentials:`);
  console.log(`   🔑 Admin: admin@quizapp.com / admin123`);
  console.log(`\n📝 Features:`);
  console.log(`   ✅ Full internationalization (i18n) support`);
  console.log(`   ✅ Role-based routing with room selection`);
  console.log(`   ✅ Real-time test functionality`);
  console.log(`   ✅ Enhanced error handling with translations`);
  console.log(`   ✅ Multi-language validation messages`);
});

module.exports = app;
