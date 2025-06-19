const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema({
    letter: {
        type: String,
        required: true,
        enum: ['A', 'B', 'C', 'D', 'E', 'F'] // Mở rộng để hỗ trợ tối đa 6 lựa chọn
    },
    text: {
        type: String,
        required: true
    }
});

const questionSchema = new mongoose.Schema({
    number: {
        type: Number,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    image: {
        type: String
    },
    options: {
        type: [optionSchema],
        validate: {
            validator: function(options) {
                return options && options.length >= 2 && options.length <= 6;
            },
            message: 'Each question must have between 2 and 6 options'
        },
        default: function() {
            return [
                { letter: 'A', text: '' },
                { letter: 'B', text: '' }
            ];
        }
    },
    correctAnswer: {
        type: String, // Chỉ 1 đáp án đúng (single choice)
        required: true,
        enum: ['A', 'B', 'C', 'D', 'E', 'F']
    },
    answerTime: {
        type: Number, // Thời gian tính bằng giây
        default: 30,  // Mặc định 30 giây
        min: 5,       // Tối thiểu 5 giây
        max: 300      // Tối đa 5 phút (300 giây)
    }
});

const quizSchema = new mongoose.Schema({
    // NEW: Auto-increment number field
    number: {
        type: Number,
        unique: true
        // Note: Removed 'required: true' to let pre-save middleware handle it
    },
    title: {
        type: String,
        required: true
    },
    mode: {
        type: String,
        required: true,
        enum: ['online', 'offline']
    },
    // THÊM MỚI: Trường roomCode để phân biệt phòng ban
    roomCode: {
        type: String,
        required: true,
        enum: ['hrm', 'hse', 'gm', 'qasx', 'sm'],
        index: true // Tạo index để tìm kiếm nhanh hơn
    },
    scheduleSettings: {
        startTime: Date,
        endTime: Date
    },
    questions: [questionSchema],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    // Thêm metadata để tính tổng thời gian quiz
    metadata: {
        totalDuration: {
            type: Number, // Tổng thời gian của tất cả câu hỏi (giây)
            default: 0
        },
        version: {
            type: String,
            default: '2.0' // Version mới sau khi loại bỏ answer-type
        }
    }
}, {
    timestamps: true
});

// Function to get next quiz number
async function getNextQuizNumber() {
    try {
        // Try to find the highest quiz number and increment
        const lastQuiz = await mongoose.model('Quiz').findOne({}, {}, { sort: { 'number': -1 } });
        if (lastQuiz && lastQuiz.number) {
            return lastQuiz.number + 1;
        } else {
            return 1; // Start from 1 for quiz numbers
        }
    } catch (error) {
        console.error('Error getting next quiz number:', error);
        // Fallback to timestamp-based number
        return Date.now() % 1000000;
    }
}

// Pre-save middleware to auto-increment quiz number
quizSchema.pre('save', async function(next) {
    if (this.isNew && !this.number) {
        try {
            this.number = await getNextQuizNumber();
            console.log(`✅ Auto-generated quiz number: ${this.number} for "${this.title}"`);
        } catch (error) {
            console.error('Error generating quiz number:', error);
            // Fallback: use timestamp-based number
            this.number = Date.now() % 1000000;
            console.log(`⚠️ Using fallback quiz number: ${this.number} for "${this.title}"`);
        }
    }
    next();
});

// Pre-save middleware để tính tổng thời gian
quizSchema.pre('save', function(next) {
    if (this.questions && this.questions.length > 0) {
        this.metadata.totalDuration = this.questions.reduce((total, question) => {
            return total + (question.answerTime || 30);
        }, 0);
    }
    next();
});

// Index compound để tìm kiếm theo roomCode và các trường khác
quizSchema.index({ roomCode: 1, createdAt: -1 });
quizSchema.index({ roomCode: 1, mode: 1 });
quizSchema.index({ number: 1 }); // Index for quiz number

module.exports = mongoose.model('Quiz', quizSchema);