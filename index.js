const request = require("superagent");
const icsTool = require("ics");
const fs = require("fs");

const API_BASE = "https://val.native.game.qq.com/esports/v1/data/VAL_Match_";
const CACHE_FILE = "./api-cache.json";
const PROBE_AHEAD = 10;        // 向后探测的 ID 数量
const MAX_FAIL_COUNT = 3;      // 连续失败多少次后移除缓存

/**
 * 加载缓存
 * @returns {{validIds: {[id: string]: {failCount: number}}, maxId: number}}
 */
function loadCache() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
        }
    } catch (err) {
        console.log("Cache file corrupted, starting fresh");
    }
    return { validIds: {}, maxId: 1000000 };
}

/**
 * 保存缓存
 * @param {{validIds: {[id: string]: {failCount: number}}, maxId: number}} cache
 */
function saveCache(cache) {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

/**
 * 尝试获取单个 API 数据
 * @param {number} id
 * @returns {Promise<{id: number, games: {}[]}|null>}
 */
async function fetchApiData(id) {
    const url = `${API_BASE}${id}.json`;
    try {
        const response = await request.get(url).timeout({ response: 5000 });
        const data = response.body;
        if (data && data.msg && Array.isArray(data.msg) && data.msg.length > 0) {
            return { id, games: data.msg };
        }
    } catch (err) {
        // 请求失败或无数据，静默忽略
    }
    return null;
}

/**
 * 智能获取所有有效的 API 数据
 * @returns {Promise<{}[]>}
 */
async function fetchAllGames() {
    const cache = loadCache();
    const cachedIds = Object.keys(cache.validIds).map(Number);

    // 生成需要探测的 ID 列表：已缓存的 + 从 maxId 向后探测
    const probeIds = [];
    for (let i = cache.maxId + 1; i <= cache.maxId + PROBE_AHEAD; i++) {
        probeIds.push(i);
    }

    const allIds = [...new Set([...cachedIds, ...probeIds])];
    console.log(`Fetching ${cachedIds.length} cached IDs + probing ${probeIds.length} new IDs (${cache.maxId + 1} - ${cache.maxId + PROBE_AHEAD})`);

    // 并发请求所有 ID
    const results = await Promise.all(allIds.map(id => fetchApiData(id)));

    // 处理结果，更新缓存
    const validResults = [];
    let newMaxId = cache.maxId;

    for (let i = 0; i < allIds.length; i++) {
        const id = allIds[i];
        const result = results[i];

        if (result !== null) {
            // 成功：重置失败计数，更新 maxId
            cache.validIds[id] = { failCount: 0 };
            if (id > newMaxId) newMaxId = id;
            validResults.push(result);
            console.log(`✓ ID ${id}: ${result.games.length} matches`);
        } else if (cache.validIds[id] !== undefined) {
            // 已缓存的 ID 失败：增加失败计数
            cache.validIds[id].failCount = (cache.validIds[id].failCount || 0) + 1;
            if (cache.validIds[id].failCount >= MAX_FAIL_COUNT) {
                console.log(`✗ ID ${id}: removed after ${MAX_FAIL_COUNT} failures`);
                delete cache.validIds[id];
            } else {
                console.log(`✗ ID ${id}: fail count ${cache.validIds[id].failCount}/${MAX_FAIL_COUNT}`);
            }
        }
        // 新探测的 ID 失败：不做处理
    }

    cache.maxId = newMaxId;
    saveCache(cache);

    console.log(`Found ${validResults.length} valid endpoints, maxId: ${cache.maxId}`);

    // 合并所有比赛，使用 matchId 去重
    const gameMap = new Map();
    for (const result of validResults) {
        for (const game of result.games) {
            const key = game.matchId || `${game.matchDate}_${game.teamA?.teamSpName}_${game.teamB?.teamSpName}`;
            if (!gameMap.has(key)) {
                gameMap.set(key, game);
            }
        }
    }

    const allGames = Array.from(gameMap.values());
    console.log(`Total unique matches: ${allGames.length}`);
    return allGames;
}


/**
 *
 * @param {{}[]} games
 */
function packageGames(games, hasAlarm, calName) {
    return games.map((game) => {
        const gameDate = new Date(game.matchDate);
        const durationMinutes = 2 * 60;
        const gameEndDate = new Date(gameDate.getTime() + durationMinutes * 60 * 1000);
        let gameName = "";
        // gameName = game.secondLevelGameName;
        // gameName += ` ${game.bMatchName}`
        gameName += `${game.teamA?.teamSpName || "TBD"} vs ${game.teamB?.teamSpName || "TBD"}`
        const hasResult = parseInt(game.scoreA) || parseInt(game.scoreB);
        if (hasResult) {
            gameName += ` - ${game.scoreA} : ${game.scoreB}`;
        }
        return {
            title: gameName,
            description: `${game.secondLevelGameName} ${game.bMatchName} ${game.matchFormat}`,
            start: [gameDate.getFullYear(), gameDate.getMonth() + 1, gameDate.getDate(), gameDate.getHours(), gameDate.getMinutes()],
            end: [gameEndDate.getFullYear(), gameEndDate.getMonth() + 1, gameEndDate.getDate(), gameEndDate.getHours(), gameEndDate.getMinutes()],
            organizer: {
                name: `无畏契约${game.secondLevelGameName}`,
                email: "vct@qq.com",
            },
            url: "https://web.haojiao.cc/h/t2Ud5pOQlscKLbRC/adPVjlSLS6j8ja7S",
            status: "TENTATIVE",
            calName: calName ? calName : "VCT-CN",
            geo: { lat: 30.0095, lon: 120.2669 },
            startInputType: "utc",
            startOutputType: "utc",
            endInputType: "utc",
            endOutputType: "utc",
            alarms: hasAlarm && !hasResult ? [{ action: "audio", trigger: { minutes: 30, before: true, repeat: 1, attachType: "VALUE=URI", attach: "Glass" } }] : [],
        };
    });
}

/**
 * 生成 ICS 文件
 * @param {{}[]} games
 * @param {boolean} hasAlarm
 */
function generateICS(games, hasAlarm) {
    const events = packageGames(games, hasAlarm);
    const result = icsTool.createEvents(events);

    if (result.error) {
        console.error(result.error);
    } else {
        fs.writeFileSync(`./vct-cn${hasAlarm ? "-alarm" : ""}.ics`, result.value);
        console.log(`Generated vct-cn${hasAlarm ? "-alarm" : ""}.ics with ${events.length} events`);
    }
}

async function main() {
    const allGames = await fetchAllGames();
    if (allGames.length > 0) {
        generateICS(allGames, true);
    } else {
        console.log("No games found from any API endpoint");
    }
}

main();
