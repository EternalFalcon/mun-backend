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
    console.log("Request payload at /delegation:", req.body);

    const {
      order_id,
      payment_id,
      razorpay_signature,
      institutionName,
      totalParticipants,
      events,
    } = req.body;

    // Validation for required fields
    if (!order_id || !payment_id || !razorpay_signature || !institutionName || !events) {
      return res.status(400).json({
        error: "Missing required fields",
        data: req.body,
      });
    }
  
    // Prepare registration data
    const regPage = doc(db, "mun-details", "registrations");
    const regInfo = (await getDoc(regPage)).data() || { id: 0, delegation: 0, total: 0 };

    const newDelegationId = parseInt(regInfo.delegation || 0) + 10;
    const updatedTotal = parseInt(regInfo.total || 0) + totalParticipants;

    console.log("New Delegation ID:", newDelegationId, "Updated Total:", updatedTotal);

    // Save delegation information
    const delegationData = {
      institutionName,
      totalParticipants,
      events,
      paymentDetails: {
        order_id,
        payment_id,
        razorpay_signature,
      },
      timestamp: new Date().toISOString(),
    };

    // Save delegation data under the institution
    console.log("Saving delegation data...");
    await setDoc(doc(db, "delegations", newDelegationId.toString()), delegationData);

    // Save individual participant data
    const ids = [];
    let uniqueId = parseInt(regInfo.id || 0);
    for (const event of events) {
      console.log(`Processing event: ${event.name}`);
      for (const participant of event.participants) {
        uniqueId += 10;
        ids.push([participant.name, uniqueId]);

        // Save participant under the institution and event
        const participantDoc = doc(
          db,
          "delegations",
          newDelegationId.toString(),
          "participants",
          uniqueId.toString()
        );
        await setDoc(participantDoc, {
          ...participant,
          event: event.name,
          category: event.category,
          institutionName,
          uniqueId,
        });
      }
    }

    // Update delegation summary in Firestore
    console.log("Updating delegation summary...");
    await setDoc(
      regPage,
      {
        id: uniqueId,
        delegation: newDelegationId,
        total: updatedTotal,
      },
      { merge: true }
    );

    res.status(200).json({ result: "success", ids });
  } catch (error) {
    console.error("Error in /delegation endpoint:", error.message);
    res.status(500).json({
      error: "Internal server error",
      details: error.message,
    });
  }
});



// Start Server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
