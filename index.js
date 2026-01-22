const request = require("superagent");
const icsTool = require("ics");
const fs = require("fs");
const path = require("path");

const API_BASE = "https://val.native.game.qq.com/esports/v1/data/VAL_Match_";
const CACHE_DIR = "./cache";
const PROBE_AHEAD = 10;        // 向后探测的 ID 数量

/**
 * 确保缓存目录存在
 */
function ensureCacheDir() {
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

/**
 * 获取所有已缓存的 ID（从文件名解析）
 * @returns {number[]}
 */
function getCachedIds() {
    ensureCacheDir();
    const files = fs.readdirSync(CACHE_DIR);
    return files
        .filter(f => f.endsWith(".json"))
        .map(f => parseInt(path.basename(f, ".json")))
        .filter(id => !isNaN(id))
        .sort((a, b) => a - b);
}

/**
 * 获取最大的已缓存 ID
 * @returns {number}
 */
function getMaxCachedId() {
    const ids = getCachedIds();
    return ids.length > 0 ? Math.max(...ids) : 1000000;
}

/**
 * 保存单个 ID 的数据到缓存文件
 * @param {number} id
 * @param {{}[]} games
 */
function saveCacheFile(id, games) {
    ensureCacheDir();
    const filePath = path.join(CACHE_DIR, `${id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(games, null, 2));
}

/**
 * 读取单个缓存文件
 * @param {number} id
 * @returns {{}[]|null}
 */
function loadCacheFile(id) {
    const filePath = path.join(CACHE_DIR, `${id}.json`);
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, "utf-8"));
        }
    } catch (err) {
        console.log(`Failed to read cache file ${id}.json`);
    }
    return null;
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
 * 刷新已缓存的 ID 并探测新 ID
 * @returns {Promise<{}[]>}
 */
async function fetchAllGames() {
    const cachedIds = getCachedIds();
    const maxId = getMaxCachedId();

    // 生成探测的新 ID 列表
    const probeIds = [];
    for (let i = maxId + 1; i <= maxId + PROBE_AHEAD; i++) {
        probeIds.push(i);
    }

    console.log(`Refreshing ${cachedIds.length} cached IDs, probing ${probeIds.length} new IDs (${maxId + 1} - ${maxId + PROBE_AHEAD})`);

    // 并发请求：刷新已缓存的 + 探测新的
    const allIds = [...cachedIds, ...probeIds];
    const results = await Promise.all(allIds.map(id => fetchApiData(id)));

    // 处理结果
    const allGames = [];

    for (let i = 0; i < allIds.length; i++) {
        const id = allIds[i];
        const result = results[i];
        const isCached = cachedIds.includes(id);

        if (result !== null) {
            // 成功：保存/更新缓存文件
            saveCacheFile(id, result.games);
            allGames.push(...result.games);
            console.log(`✓ ID ${id}: ${result.games.length} matches${isCached ? " (refreshed)" : " (new)"}`);
        } else if (isCached) {
            // 已缓存的 ID 请求失败：使用缓存数据
            const cachedGames = loadCacheFile(id);
            if (cachedGames) {
                allGames.push(...cachedGames);
                console.log(`⟳ ID ${id}: using cached data (${cachedGames.length} matches)`);
            }
        }
        // 新探测的 ID 失败：不做处理
    }

    // 使用 bMatchId 去重
    const gameMap = new Map();
    for (const game of allGames) {
        const key = game.bMatchId || `${game.matchDate}_${game.teamA?.teamSpName}_${game.teamB?.teamSpName}`;
        if (!gameMap.has(key)) {
            gameMap.set(key, game);
        }
    }

    const uniqueGames = Array.from(gameMap.values());
    console.log(`Total unique matches: ${uniqueGames.length}`);
    return uniqueGames;
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
