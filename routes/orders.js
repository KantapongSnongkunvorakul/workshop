var express = require('express');
var router = express.Router();
var Order = require('../models/order.model');
var User = require('../models/user.model');
var Product = require('../models/product.model');
var tokenMiddleware = require('../middleware/token.middleware');


/* Helper function to check if user is Admin*/
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'Admin') {
        next();
    } else {
        res.status(403).json({ message: "Forbidden: Only Admin can perform this action" });
    }
};


/* POST new order. (สร้างคำสั่งซื้อใหม่ - User Only) */
router.post('/', tokenMiddleware, async function(req, res, next) {
    try {
        // ตรวจสอบ Role
        if (req.user.role !== 'User') {
            return res.status(403).json({ message: "Forbidden: Only User can create orders" });
        }

        const userId = req.user._id; // ดึง User ID จาก Token
        const { items } = req.body; // รับรายการสินค้าและจำนวนจาก Body JSON

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ message: "Items array is required in the request body" });
        }

        let totalAmount = 0;
        const orderItems = [];

        // loop ตรวจสอบสินค้าและคำนวณยอดรวม
        for (const item of items) {
            if (!item.productId || !item.quantity || item.quantity <= 0) {
                 return res.status(400).json({ message: "Each item must have productId and quantity (>= 1)" });
            }

            const product = await Product.findById(item.productId);

            if (!product) {
                return res.status(404).json({ message: `Product not found with ID: ${item.productId}` });
            }

            // ตรวจสอบจำนวนสินค้าในคลัง
            if (product.stock < item.quantity) {
                return res.status(400).json({ message: `Not enough stock for product: ${product.name}. Available: ${product.stock}` });
            }

            // เพิ่มรายการสินค้าที่จะบันทึกใน Order
            orderItems.push({
                product: product._id, 
                quantity: item.quantity,
            });

            // คำนวณยอดรวม
            totalAmount += product.price * item.quantity;

            //หักจำนวนสินค้าในคลัง
            product.stock -= item.quantity;
            await product.save(); 
        }

        // สร้างเอกสาร Order ใหม่
        const newOrder = new Order({
            user: userId, // กำหนดผู้ใช้ที่สั่งซื้อ
            items: orderItems, // กำหนดรายการสินค้า
            totalAmount: totalAmount, // กำหนดยอดรวม
            status: 'Pending' // กำหนดสถานะเริ่มต้น
        });

        await newOrder.save(); // บันทึก Order

        // Optional: ดึงข้อมูล User และ Product มาแสดงใน Response (ถ้าต้องการ)
        const populatedOrder = await Order.findById(newOrder._id)
          .populate('user', 'name') 
          .populate('items.product', 'name price');

        res.status(201).json({ message: 'Order created successfully', order: populatedOrder });

    } catch (error) {
        console.error("Error creating order:", error);
        res.status(500).send(error.message || 'Error creating order');
    }
});


/* GET my orders. (ดูคำสั่งซื้อของตัวเอง - User Only) */
router.get('/myorders', tokenMiddleware, async function(req, res, next) {
    try {
        // ตรวจสอบ Role ว่าเป็น User หรือไม่
        if (req.user.role !== 'User') {
            return res.status(403).json({ message: "Forbidden: Only User can view their own orders" });
        }

        const userId = req.user._id; // ดึง User ID จาก Token ของผู้ใช้ที่ Login

        // ค้นหา Order ทั้งหมดที่เป็นของผู้ใช้คนนี้
        const myOrders = await Order.find({ user: userId })
          .populate('items.product', 'name price imageFilename') // ดึงข้อมูลสินค้าบางส่วนในรายการ
          .sort({ createdAt: -1 }); // เรียงตามเวลาสร้างล่าสุด

        res.json(myOrders);

    } catch (error) {
        console.error("Error fetching user orders:", error);
        res.status(500).json({ message: "Error fetching user orders", error: error.message });
    }
});

/* GET all orders. (Admin Only) */
router.get('/', tokenMiddleware, isAdmin, async function(req, res, next) {
    try {
        // ค้นหา Order ทั้งหมดในระบบ
        const allOrders = await Order.find({})
          .populate('user', 'name') 
          .populate('items.product', 'name price') 
          .sort({ createdAt: -1 });

        res.json(allOrders);

    } catch (error) {
        console.error("Error fetching all orders:", error);
        res.status(500).json({ message: "Error fetching all orders", error: error.message });
    }
});

/* GET order by ID. (ดูคำสั่งซื้อตาม ID - Admin Only) */
router.get('/:id', tokenMiddleware, isAdmin, async function(req, res, next) {
     try {
        const orderId = req.params.id;

        const order = await Order.findById(orderId)
          .populate('user', 'name')
          .populate('items.product', 'name price');

        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        res.json(order);

     } catch (error) {
        console.error("Error fetching order by ID:", error);
        res.status(500).json({ message: "Error fetching order", error: error.message });
     }
});


/* {
  "items": [ 
    
    {
      "productId": "681b7d43e51677b3b1d2dec6",
      "quantity": 1
    },
    
    {
      "productId": "681b7fb7e51677b3b1d2dec8",
      "quantity": 1
    }

  ]
}
  สำหรับ POST เป็น array(สร้าง orders ใหม่) */


module.exports = router;