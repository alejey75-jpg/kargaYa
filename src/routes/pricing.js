const { Router } = require('express');
const router = Router();
const db = require('../db/memory');
const { calcPrice, priceForecast, estimateSessionCost } = require('../services/pricing.service');
router.get('/current',  (req,res)=>{ try{res.json({ok:true,data:calcPrice(req.query.stationId)})}catch(e){res.status(404).json({ok:false,error:e.message})}});
router.get('/forecast', (req,res)=>{ try{res.json({ok:true,data:priceForecast(req.query.stationId,parseInt(req.query.hours||12))})}catch(e){res.status(404).json({ok:false,error:e.message})}});
router.get('/all',      (req,res)=>{ res.json({ok:true,data:db.STATIONS.map(s=>calcPrice(s.id))}) });
router.post('/estimate',(req,res)=>{ const{stationId,from_pct=10,to_pct=85,battery_kwh=60}=req.body; try{res.json({ok:true,data:estimateSessionCost(stationId,from_pct,to_pct,battery_kwh)})}catch(e){res.status(404).json({ok:false,error:e.message})}});
module.exports = router;
