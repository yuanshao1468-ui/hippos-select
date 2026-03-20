const fs = require('fs');
const path = require('path');

// 蝦皮聯盟 API 設定
const API_URL = 'https://shopee-affiliate.zeabur.app/api/shopee/search';
const APP_ID = '16354170017';
const SECRET = 'IOJCODOTKSSCICVHVYIATPJEGAO22BTR';

// ==========================================
// Hippo's Select 走量模式 (機槍掃射)
// ==========================================
const MIN_SALES = 500;           // 銷量 > 500 (大眾熱銷)
const MIN_RATING = 4.8;          // 評分 > 4.8 (幾乎無負評)
const MIN_PRICE = 100;           // 價格 >= 100 (過濾掉利潤太低的湊單品)
const MAX_PRICE = 500;           // 價格 <= 500 (無腦衝動下單區間)
const WEBSITE_ITEMS_COUNT = 100; // 每天網站更新 100 筆精華

// 網站資料庫路徑
const storeDataPath = path.join(__dirname, 'store_data.json');
// 每日 Top 10 推廣名單路徑 (給小蝦早上寫文案用的)
const top10Path = path.join(__dirname, 'top10_marketing.json');

const SHOPEE_CATEGORIES = [
    { id: 101774, name: "居家生活" },
    { id: 101186, name: "美妝保養" },
    { id: 101267, name: "3C與筆電" },
    { id: 101416, name: "服飾" },
    { id: 101017, name: "食品" },
    { id: 101700, name: "運動" },
    { id: 101569, name: "婦幼" },
    { id: 101888, name: "寵物" }
];

async function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function fetchShopeeProductsByCat(cat) {
    console.log(`🦛 [Hippo引擎] 正在掃描【${cat.name}】大眾特賣品...`);
    const payload = {
        keyword: null, productCatId: cat.id, shopId: null, itemId: null,
        sortType: 2, isAMSOffer: true, isKeySeller: false,
        totalItems: 500, appId: APP_ID, secret: SECRET
    };
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'accept': '*/*', 'content-type': 'application/json',
                'origin': 'https://shpquery.com', 'referer': 'https://shpquery.com/',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36'
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) return [];
        const data = await response.json();
        return data.data || data.items || [];
    } catch (e) {
        console.log(`❌ 請求失敗: ${e.message}`);
        return [];
    }
}

function formatForWebsite(item, catName) {
    const price = parseFloat(item.price || 0);
    const priceMax = parseFloat(item.priceMax || price);
    // 為了視覺效果，製造一個原價 (若無原價，自動加 30%~50% 模擬特價感)
    const originalPrice = Math.floor(priceMax * (1 + (Math.random() * 0.3 + 0.2))); 
    
    return {
        id: item.itemId,
        name: item.productName || item.title || '質感好物',
        image: item.imageUrl || '',
        price: price,
        originalPrice: originalPrice,
        sales: parseInt(item.sales || 0),
        category: catName,
        link: item.offerLink || item.productLink || ''
    };
}

(async () => {
    console.log('====================================================');
    console.log(`🦛 [Hippo's Select] 特價情報雷達啟動！`);
    console.log(`📊 條件：銷量 >500 | 評分 >4.8 | 價格 <500 | 無視佣金門檻`);
    console.log('====================================================');
    
    let websiteProducts = [];
    const seenItems = new Set();

    for (const cat of SHOPEE_CATEGORIES) {
        if (websiteProducts.length >= WEBSITE_ITEMS_COUNT) break;
        
        const raw = await fetchShopeeProductsByCat(cat);
        
        for (const item of raw) {
            if (!item) continue;
            const price = parseFloat(item.price || 0);
            const sales = parseInt(item.sales || 0);
            const rating = parseFloat(item.ratingStar || 0);

            if (price > 0 && price <= MAX_PRICE && sales >= MIN_SALES && rating >= MIN_RATING) {
                if (!seenItems.has(item.itemId)) {
                    seenItems.add(item.itemId);
                    websiteProducts.push(formatForWebsite(item, cat.name));
                }
            }
        }
        await delay(3000); 
    }

    // 依照銷量排序，取前 100 名放到網站
    websiteProducts.sort((a, b) => b.sales - a.sales);
    const finalWebData = websiteProducts.slice(0, WEBSITE_ITEMS_COUNT);
    
    if (finalWebData.length > 0) {
        // 1. 產出網站用資料庫
        fs.writeFileSync(storeDataPath, JSON.stringify(finalWebData, null, 4), 'utf8');
        console.log(`✅ [網站更新] 已將 ${finalWebData.length} 筆超殺特價品更新至 Hippo's Select 資料庫！`);

        // 2. 產出每日 Top 10 推廣名單 (給小蝦寫文案用的)
        const top10 = finalWebData.slice(0, 10);
        fs.writeFileSync(top10Path, JSON.stringify(top10, null, 4), 'utf8');
        console.log(`✅ [文案儲備] 已將 Top 10 銷量霸主存入文案庫，等待老闆早上呼叫小蝦撰寫！`);

        // 3. 自動 Push 到 GitHub 觸發 Vercel 更新
        try {
            const { execSync } = require('child_process');
            console.log('🦛 [上雲端] 正在將最新商品資料推送到 GitHub...');
            execSync('git add store_data.json top10_marketing.json', { cwd: __dirname });
            execSync('git commit -m "Auto-update Daily Top 100 Products"', { cwd: __dirname });
            execSync('git push origin main', { cwd: __dirname });
            console.log('✅ [Vercel 觸發] GitHub 推送成功！Vercel 將在 1 分鐘內自動更新網站！');
        } catch (gitErr) {
            console.log('⚠️ [警告] 自動推送 GitHub 失敗:', gitErr.message);
        }

    } else {
        console.log('🦛 [殘酷現實] 今日未掃描到符合特價條件的大眾爆款。');
    }
})();