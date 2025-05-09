var express = require('express');
var router = express.Router();
var Product = require('../models/product.model');
var Order = require('../models/order.model');
var tokenMiddleware = require('../middleware/token.middleware'); 
var multer = require('multer'); 
var fs = require('fs'); // สำหรับลบไฟล์
var path = require('path'); // สำหรับจัดการ path

// ตั้งค่า Multer Storage สำหรับรูปสินค้า (เหมือน Users แต่เก็บรูปสินค้า)
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, './public/images/products'); // อาจจะแยกโฟลเดอร์รูปสินค้า
  },
  filename: function (req, file, cb) {
    cb(null, new Date().getTime() + "_" + file.originalname);
  } 
});

const upload = multer({ storage: storage });


/* Helper function to check if user is Admin */
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'Admin') {
        next(); // ถ้าเป็น Admin ให้ไปต่อ
    } else {
        res.status(403).json({ message: "Forbidden: Only Admin can perform this action" }); // ถ้าไม่ใช่ Admin ให้ส่ง 403
    }
};


/* GET all products. (ดึงสินค้าทั้งหมด - ไม่ต้อง Login ก็ดูได้) */
router.get('/', async function(req, res, next) {
    try {
        let products = await Product.find({});
        res.json(products);
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).json({ message: "Error fetching products", error: error.message });
    }
});

/* GET product by ID. (ดึงสินค้าตาม ID - ไม่ต้อง Login ก็ดูได้) */
router.get('/:id', async function(req, res, next) {
    try {
        const productId = req.params.id;
        let product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        res.json(product);
    } catch (error) {
        console.error("Error fetching product by ID:", error);
        res.status(500).json({ message: "Error fetching product", error: error.message });
    }
});

/* POST new product. (เพิ่มสินค้าใหม่ - Admin Only) */
router.post('/', tokenMiddleware, isAdmin, upload.single('image'), async function(req, res, next) {
    try {
        let { name, description, price, stock } = req.body;

        if (!name || !price || stock === undefined) { 
            if (req.file && req.file.path) fs.unlinkSync(req.file.path); // ลบไฟล์ที่อัปโหลดถ้าข้อมูลไม่ครบ
            return res.status(400).send('Name, Price, and Stock are required');
        }

        let newProduct = new Product({
            name: name,
            description: description,
            price: price,
            stock: stock,
            imageFilename: req.file ? req.file.filename : undefined // บันทึกชื่อไฟล์ถ้ามี
        });

        await newProduct.save();

        res.status(201).json({ message: 'Product created successfully', product: newProduct });

    } catch (error) {
        console.error("Error creating product:", error);
         if (req.file && req.file.path) fs.unlinkSync(req.file.path); // ลบไฟล์ที่อัปโหลดถ้าเกิด error
        res.status(500).send(error.message || 'Error inserting product');
    }
});

/* PUT update product by ID. (อัปเดตสินค้า - Admin Only) */
router.put('/:id', tokenMiddleware, isAdmin, upload.single('image'), async function(req, res, next) {
    try {
        const productId = req.params.id;
        let { name, description, price, stock } = req.body;

        let updateData = { name, description, price, stock };

        // ถ้ามีไฟล์ภาพใหม่ถูกอัปโหลดมา
        if (req.file) {
            // ค้นหาสินค้าเดิมเพื่อดูชื่อไฟล์ภาพเก่า ถ้ามี จะได้ลบไฟล์เก่าทิ้ง
            const oldProduct = await Product.findById(productId);
            if (oldProduct && oldProduct.imageFilename) {
                const oldImagePath = path.join(__dirname, '../public/images/products', oldProduct.imageFilename);
                 if (fs.existsSync(oldImagePath)) {
                     fs.unlink(oldImagePath, (err) => {
                         if (err) console.error("Error deleting old product image file:", err);
                     });
                 }
            }
            // เพิ่มชื่อไฟล์ภาพใหม่เข้าไปในข้อมูลที่จะอัปเดต
            updateData.imageFilename = req.file.filename;
        }

        let product = await Product.findByIdAndUpdate(productId, updateData, { new: true });

        if (!product) {
             if (req.file && req.file.path) fs.unlinkSync(req.file.path); // ลบไฟล์ที่อัปโหลดถ้าไม่พบสินค้า
            return res.status(404).json({ message: "Product not found" });
        }

        res.json(product);

    } catch (error) {
        console.error("Error updating product:", error);
         if (req.file && req.file.path) fs.unlinkSync(req.file.path); // ลบไฟล์ที่อัปโหลดถ้าเกิด error
        res.status(500).send(error.message || 'Error updating product');
    }
});

/* DELETE product by ID. (ลบสินค้า - Admin Only) */
router.delete('/:id', tokenMiddleware, isAdmin, async function(req, res, next) {
    try {
        const productId = req.params.id;

        // ค้นหาสินค้าก่อนลบ เพื่อดูชื่อไฟล์ภาพเก่า จะได้ลบไฟล์ทิ้งด้วย
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        // ลบไฟล์ภาพเก่า ถ้ามี
        if (product.imageFilename) {
            const oldImagePath = path.join(__dirname, '../public/images/products', product.imageFilename);
             if (fs.existsSync(oldImagePath)) {
                 fs.unlink(oldImagePath, (err) => {
                     if (err) console.error("Error deleting old product image file during deletion:", err);
                 });
             }
        }

        // ลบสินค้าจากฐานข้อมูล
        await Product.findByIdAndDelete(productId);

        res.json({ message: 'Product deleted successfully', product: product });

    } catch (error) {
        console.error("Error deleting product:", error);
        res.status(500).send(error.message || 'Error deleting product');
    }
});

/* GET /api/v1/products/:id/orders (ดึงรายการคำสั่งซื้อที่มีสินค้านี้) */
router.get('/:id/orders', tokenMiddleware, isAdmin, async function(req, res, next) {
    try {
        const productId = req.params.id;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ message: "Product not found" });
        }

        const ordersWithProduct = await Order.find({
            'items': {
                $elemMatch: {
                    product: productId
                }
            }
        })
        .populate('user', 'name') 
        
        .lean(); 
        
        const processedOrders = ordersWithProduct.map(order => {
            
            const filteredItems = order.items.filter(item =>
                item.product.toString() === productId.toString() 
            );

           
            const processedOrder = {
                ...order, 
                items: filteredItems
            };

            delete processedOrder.__v;

            return processedOrder;
        });


        res.json(processedOrders);

    } catch (error) {
        console.error(`Error fetching orders for product ${req.params.id}:`, error);
        res.status(500).json({ message: "Error fetching orders for product", error: error.message });
    }
});

module.exports = router;