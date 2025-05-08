const mongoose = require("mongoose");
main().catch((err) => console.log(err));

async function main() {
    console.log(process.env.DB_HOST)
    await mongoose.connect(`mongodb://${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
    console.log("Connected DB Success.");
}