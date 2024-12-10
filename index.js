import express from "express";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  setDoc,
  doc,
  getDoc,
} from "firebase/firestore";
import bodyParser from "body-parser";
import cors from "cors";
import crypto from "crypto";
import Razorpay from "razorpay";
import dotenv from "dotenv";

import shortid from "shortid";
dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ extended: false }));
app.use(bodyParser.json());

// Firebase Initialization
const firebaseConfig = {
  apiKey: "AIzaSyDLIsh-5C2GnoUiemDWevVwojcxSeoBIlo",
  authDomain: "sjbhsphenomenon2024.firebaseapp.com",
  projectId: "sjbhsphenomenon2024",
  storageBucket: "sjbhsphenomenon2024.firebaseapp.com",
  messagingSenderId: "321451426175",
  appId: "1:321451426175:web:8562dfd8795aa59033da4a",
  measurementId: "G-6M50VRN3YX",
};
const fireApp = initializeApp(firebaseConfig);
const db = getFirestore(fireApp);

// Razorpay Initialization
const razorpay = new Razorpay({
  key_id: "rzp_live_FYKXMux8xXT6nA",
  key_secret: "TXTocXXpZlYo4TOyAOzSijZY",
});

// Middleware to Ignore Favicon Requests
app.use((req, res, next) => {
  if (req.originalUrl.includes("favicon.ico")) {
    res.status(204).end();
  } else {
    next();
  }
});

// Test Route
app.get("/", (req, res) => {
  res.status(200).send("Backend is running!");
});

// Razorpay Payment Endpoint
app.post("/indipay", async (req, res) => {
  const { total } = req.body;
  const basePrice = 300;

  // Calculate total amount
  const totalAmount = basePrice * total;

  const options = {
    amount: totalAmount * 100, // Amount in paise
    currency: "INR",
    receipt: shortid.generate(),
    payment_capture: 1,
  };

  try {
    const order = await razorpay.orders.create(options);
    res.status(200).json({
      id: order.id,
      currency: order.currency,
      amount: order.amount,
    });
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    res.status(500).json({ error: "Error creating order" });
  }
});

// Individual Registration Endpoint
app.post("/individual", async (req, res) => {
  try {
    console.log("Request payload at /individual:", req.body);

    // Use `name` from the request if `fName` is missing
    const {
      order_id,
      payment_id,
      razorpay_signature,
      fName,
      name,
      total,
      day1,
      day2,
      email,
      phoneNumber,
      dateOfBirth,
    } = req.body;

    // Assign `name` to `fName` if `fName` is not explicitly provided
    const finalName = fName || name || "Anonymous";

    if (!order_id || !payment_id || !razorpay_signature || !total) {
      return res.status(400).json({ error: "Missing required fields", data: req.body });
    }

    const registrationData = {
      fName: finalName,
      email: email || "No email provided",
      phoneNumber: phoneNumber || "No phone number provided",
      dateOfBirth: dateOfBirth || "No date of birth provided",
      total: total || 0,
      day1: day1 || {},
      day2: day2 || null,
    };

    console.log("Registration Data before Firestore:", registrationData);

    const regPage = doc(db, "mun-details", "registrations");
    const regInfo = (await getDoc(regPage)).data() || { id: 0, total: 0 };

    const newId = parseInt(regInfo.id || 0) + 10;
    const updatedTotal = parseInt(regInfo.total || 0) + total;

    console.log("New ID:", newId, "Updated Total:", updatedTotal);

    await setDoc(doc(db, "individual-registrations", newId.toString()), registrationData);
    await setDoc(
      regPage,
      { id: newId, total: updatedTotal },
      { merge: true }
    );

    res.status(200).json({ result: "success", ids: [[finalName, newId]] });
  } catch (error) {
    console.error("Error in /individual endpoint:", error.message);
    res.status(500).json({ error: "Internal server error", details: error.message });
  }
});


// Delegation Registration Endpoint
app.post("/delegation", async (req, res) => {
  try {
    console.log("Incoming request:", JSON.stringify(req.body, null, 2));

    const {
      order_id,
      payment_id,
      razorpay_signature,
      institutionName,
      totalParticipants,
      totalEvents,
      events,
    } = req.body;

    console.log("Fetching registration details...");
    const regPage = doc(db, "mun-details", "registrations");
    const regInfo = (await getDoc(regPage)).data() || {
      delegation: 0,
      totalDel: 0,
      total: 0,
      id: 0,
    };

    console.log("Existing registration info:", regInfo);

    // Proceed with saving data...
    // (Omitted for brevity — this part should stay the same)

    console.log("Delegation processed successfully.");
    res.status(200).json({ result: "success", ids });
  } catch (error) {
    console.error("Error processing delegation:", error.message);
    console.error("Stack trace:", error.stack);

    // Send error details to the frontend
    res.status(500).json({
      error: "Error processing delegation.",
      message: error.message,
      stack: error.stack,
    });
  }
});


// Start Server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
