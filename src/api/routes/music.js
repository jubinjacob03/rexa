import { Router } from "express";
import axios from "axios";

const router = Router();

const remani = () =>
  axios.create({
    baseURL: process.env.REMANI_API_URL || "http://localhost:3002",
    headers: {
      Authorization: `Bearer ${process.env.REMANI_API_KEY || ""}`,
      "Content-Type": "application/json",
    },
    timeout: 35_000,
  });

router.post("/play", async (req, res) => {
  try {
    const { data } = await remani().post("/play", req.body);
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 502;
    res.status(status).json(err.response?.data || { error: "Remani API unreachable" });
  }
});

router.post("/control", async (req, res) => {
  try {
    const { data } = await remani().post("/control", req.body);
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 502;
    res.status(status).json(err.response?.data || { error: "Remani API unreachable" });
  }
});

router.get("/status", async (req, res) => {
  try {
    const { data } = await remani().get(`/status?guildId=${req.query.guildId}`);
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 502;
    res.status(status).json(err.response?.data || { error: "Remani API unreachable" });
  }
});

export default router;
