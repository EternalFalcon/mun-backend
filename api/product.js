import express from "express";

const product = express.Router();

product.get("/", async (res, req) => {
  try {
    res.json({ status: 200, message: "Get data has successully " });
  } catch (error) {
    console.error(error);
    return res.status(500).send("Server Error");
  }
});
export default product;
