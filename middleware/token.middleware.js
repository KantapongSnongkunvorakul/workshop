var jwt = require('jsonwebtoken'); 
const JWT_SECRET = process.env.JWT_SECRET; 

const verifyToken = (req, res, next) => {

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    
    if (token == null) {
        
        return res.sendStatus(401); 
    }


    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
           
            console.error("Token verification failed:", err.message);
            return res.sendStatus(403); 
        }

        
        req.user = user; 

        
        next();
    });
};

module.exports = verifyToken; // middleware