require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * 格式化單一縣市的天氣資料
 * @param {Object} locationData - 原始 API 回傳的單一地區資料
 * @returns {Object} 整理後的格式
 */
const formatLocationWeather = (locationData) => {
  const weatherElements = locationData.weatherElement;
  const timeCount = weatherElements[0].time.length;
  const forecasts = [];

  for (let i = 0; i < timeCount; i++) {
    const forecast = {
      startTime: weatherElements[0].time[i].startTime,
      endTime: weatherElements[0].time[i].endTime,
      weather: "",
      rain: "",
      minTemp: "",
      maxTemp: "",
      comfort: "",
      windSpeed: "",
    };

    weatherElements.forEach((element) => {
      const value = element.time[i].parameter;
      switch (element.elementName) {
        case "Wx":
          forecast.weather = value.parameterName;
          break;
        case "PoP":
          forecast.rain = value.parameterName + "%";
          break;
        case "MinT":
          forecast.minTemp = value.parameterName + "°C";
          break;
        case "MaxT":
          forecast.maxTemp = value.parameterName + "°C";
          break;
        case "CI":
          forecast.comfort = value.parameterName;
          break;
        case "WS":
          forecast.windSpeed = value.parameterName;
          break;
      }
    });
    forecasts.push(forecast);
  }

  return {
    city: locationData.locationName,
    forecasts: forecasts,
  };
};

/**
 * 取得天氣預報 (支援全台灣或特定縣市)
 * GET /api/weather?city=高雄市
 */
const getWeather = async (req, res) => {
  try {
    // 檢查是否有設定 API Key
    if (!CWA_API_KEY) {
      return res.status(500).json({
        error: "伺服器設定錯誤",
        message: "請在 .env 檔案中設定 CWA_API_KEY",
      });
    }

    // 取得使用者查詢的縣市名稱 (例如: ?city=臺北市)
    const { city } = req.query;

    // 設定 API 參數
    const apiParams = {
      Authorization: CWA_API_KEY,
    };

    // 如果使用者有指定縣市，才加入 locationName 參數
    // 如果沒指定，不傳此參數 CWA API 預設會回傳全台灣所有縣市
    if (city) {
      apiParams.locationName = city;
    }

    // 呼叫 CWA API - 一般天氣預報（36小時）
    const response = await axios.get(
      `${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`,
      {
        params: apiParams,
      }
    );

    const records = response.data.records;
    const locationList = records.location;

    if (!locationList || locationList.length === 0) {
      return res.status(404).json({
        error: "查無資料",
        message: city ? `找不到「${city}」的天氣資料` : "無法取得天氣資料",
      });
    }

    // 將所有抓到的地區資料進行格式化整理
    const formattedData = locationList.map((location) =>
      formatLocationWeather(location)
    );

    res.json({
      success: true,
      datasetDescription: records.datasetDescription,
      count: formattedData.length,
      data: formattedData,
    });
  } catch (error) {
    console.error("取得天氣資料失敗:", error.message);

    if (error.response) {
      return res.status(error.response.status).json({
        error: "CWA API 錯誤",
        message: error.response.data.message || "無法取得天氣資料",
        details: error.response.data,
      });
    }

    res.status(500).json({
      error: "伺服器錯誤",
      message: "無法取得天氣資料，請稍後再試",
    });
  }
};

// Routes
app.get("/", (req, res) => {
  res.json({
    message: "歡迎使用 CWA 天氣預報 API",
    endpoints: {
      all_taiwan: "/api/weather",
      specific_city: "/api/weather?city=高雄市",
      health: "/api/health",
    },
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 通用天氣查詢路由
app.get("/api/weather", getWeather);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "伺服器錯誤",
    message: err.message,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "找不到此路徑",
  });
});

app.listen(PORT, () => {
  console.log(`🚀 伺服器已運作`);
  console.log(`📍 環境: ${process.env.NODE_ENV || "development"}`);
  console.log(`📡 測試全台資料: http://localhost:${PORT}/api/weather`);
  console.log(`📡 測試特定縣市: http://localhost:${PORT}/api/weather?city=高雄市`);
});