var express = require('express');
var router = express.Router();
var User = require('../models/user.model');
var multer = require('multer');
var bcrypt = require('bcrypt');
var jwt = require('jsonwebtoken');
var tokenMiddleware = require('../middleware/token.middleware');
var fs = require('fs');
var path = require('path');

const JWT_SECRET = process.env.JWT_SECRET;

// ตั้งค่า Multer Storage
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './public/images');
    },
    filename: function (req, file, cb) {
        cb(null, new Date().getTime() + "_" + file.originalname);
    }
});

const upload = multer({ storage: storage });

// === Authentication Routes ===

// POST /users (Registration)
router.post('/register', upload.single('image'), async function (req, res, next) {
    try {
        const { name, age, password } = req.body;

        if (!name || !password) {
            if (req.file && req.file.path) fs.unlinkSync(req.file.path);
            return res.status(400).send('Name and Password are required');
        }

        const existingUser = await User.findOne({ name });
        if (existingUser) {
            if (req.file && req.file.path) fs.unlinkSync(req.file.path);
            return res.status(409).send('Username already exists');
        }

        const hashedPassword = await bcrypt.hash(password, 10); // hash password
        //ข้อมูลที่ต้องการบันทึก
        const user = new User({
            name,
            age,
            password: hashedPassword,
            imageFilename: req.file ? req.file.filename : null,
            role: 'User'
        });

        await user.save();

        const token = jwt.sign(
            { _id: user._id, name: user.name, role: user.role },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.status(201).json({
            message: 'User created successfully',
            token: token,
            user: user.toJSON()
        });

    } catch (error) {
        if (req.file && req.file.path) fs.unlinkSync(req.file.path);
        console.error("Error creating user:", error);
        res.status(500).send(error.message || 'Error inserting user');
    }
});

// POST /users/login (Login)
router.post('/login', async function (req, res, next) {
    try {
        const { name, password } = req.body;

        if (!name || !password) {
            return res.status(400).send('Username and Password are required');
        }

        const user = await User.findOne({ name });

        if (!user) {
            return res.status(401).send('Authentication failed: User not found');
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).send('Authentication failed: Incorrect password');
        }

        const token = jwt.sign(
            { _id: user._id, name: user.name, role: user.role },
            JWT_SECRET,
            { expiresIn: '1h' }
        );

        res.json({
            message: 'Login successful',
            token: token,
            user: user.toJSON()
        });

    } catch (error) {
        console.error("Error during login:", error);
        res.status(500).send(error.message || 'Internal server error during login');
    }
});
/*{
    "name": "ชื่อผู้ใช้ที่ลงทะเบียนไว้",
    "password": "รหัสผ่านของผู้ใช้นั้น"
  }*/

// === User Management Routes ===

// GET /users (Get all users)
router.get('/', tokenMiddleware, async function (req, res, next) {
    try {
        if (req.user.role !== 'Admin') {
            return res.status(403).json({ message: "Forbidden: Only Admin can view all users" });
        }

        const users = await User.find({}).select('-password');
        res.json(users);

    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({ message: "Error fetching users", error: error.message });
    }
});

// GET /users/:id (Get user by ID)
router.get('/:id', tokenMiddleware, async function (req, res, next) {
    try {
        const userId = req.params.id;
        const loggedInUser = req.user;

        if (loggedInUser._id !== userId && loggedInUser.role !== 'Admin') {
            return res.status(403).json({ message: "Forbidden: You can only view your own profile" });
        }

        const user = await User.findById(userId).select('-password');

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json(user);

    } catch (error) {
        console.error("Error fetching user by ID:", error);
        res.status(500).json({ message: "Error fetching user", error: error.message });
    }
});

// PUT /users/:id (Update user)
router.put('/:id', tokenMiddleware, upload.single('image'), async function (req, res, next) {
    try {
        const userId = req.params.id;
        const loggedInUser = req.user;

        if (loggedInUser._id !== userId && loggedInUser.role !== 'Admin') {
            if (req.file && req.file.path) fs.unlinkSync(req.file.path);
            return res.status(403).json({ message: "Forbidden: You can only update your own profile" });
        }

        const { name, age, password } = req.body;
        const updateData = { name, age };

        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        if (req.file) {
            const oldUser = await User.findById(userId);
            if (oldUser && oldUser.imageFilename) {
                const oldImagePath = path.join(__dirname, '../public/images', oldUser.imageFilename);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlink(oldImagePath, (err) => {
                        if (err) console.error("Error deleting old image file:", err);
                    });
                }
            }
            updateData.imageFilename = req.file.filename;
        }

        const user = await User.findByIdAndUpdate(userId, updateData, { new: true }).select('-password');

        if (!user) {
            if (req.file && req.file.path) fs.unlinkSync(req.file.path);
            return res.status(404).json({ message: "User not found" });
        }

        res.json(user.toJSON());

    } catch (error) {
        console.error("Error updating user:", error);
        if (req.file && req.file.path) fs.unlinkSync(req.file.path);
        res.status(500).send(error.message || 'Error updating user');
    }
});

// DELETE /users/:id (Delete user)
router.delete('/:id', tokenMiddleware, async function (req, res, next) {
    try {
        const userId = req.params.id;
        const loggedInUser = req.user;

        if (loggedInUser._id !== userId && loggedInUser.role !== 'Admin') {
            return res.status(403).json({ message: "Forbidden: You can only delete your own profile" });
        }

        if (!userId) {
            return res.status(400).send('User ID is required for delete');
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.imageFilename) {
            const oldImagePath = path.join(__dirname, '../public/images', user.imageFilename);
            if (fs.existsSync(oldImagePath)) {
                fs.unlink(oldImagePath, (err) => {
                    if (err) console.error("Error deleting old image file during deletion:", err);
                });
            }
        }

        await User.findByIdAndDelete(userId);

        res.json({
            message: 'User deleted successfully',
            user: user.toJSON()
        });

    } catch (error) {
        console.error("Error deleting user:", error);
        res.status(500).send(error.message || 'Error deleting user');
    }
});

module.exports = router;
