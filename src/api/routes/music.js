import { Router } from "express";
import axios from "axios";
import http from "http";

const router = Router();

const agent = new http.Agent({ keepAlive: true, maxSockets: 10 });

const remani = () =>
  axios.create({
    baseURL: process.env.REMANI_API_URL || "http://localhost:8000",
    headers: {
      Authorization: `Bearer ${process.env.REMANI_API_KEY || ""}`,
      "Content-Type": "application/json",
    },
    timeout: 35_000,
    httpAgent: agent,
  });

const proxy = (method, path, bodyOrQuery) => async (req, res) => {
  try {
    const opts = method === "get"
      ? { params: req.query }
      : {};
    const { data } = await remani()[method](path, method === "get" ? opts : (bodyOrQuery === "body" ? req.body : opts));
    res.json(data);
  } catch (err) {
    const status = err.response?.status || 502;
    res.status(status).json(err.response?.data || { error: "Remani API unreachable" });
  }
};

router.post("/play", proxy("post", "/play", "body"));
router.post("/control", proxy("post", "/control", "body"));
router.post("/search", proxy("post", "/search", "body"));
router.get("/status", proxy("get", "/status"));
router.get("/health", proxy("get", "/health"));

export default router;
