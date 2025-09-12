const request = require("superagent");
const icsTool = require("ics");
const fs = require("fs");
const API_URL = "https://val.native.game.qq.com/esports/v1/data/VAL_Match_1000045.json";


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
 *
 * @param {{}} gameBundle
 * @param {boolean} hasAlarm
 * @param {string} gameName
 */
function generateICS(gameBundle, hasAlarm) {
    const gameInfo = gameBundle.msg;

    const games = packageGames(gameInfo, hasAlarm);
    const result = icsTool.createEvents(games);

    if (result.error) {
        console.error(result.error);
    } else {
        fs.writeFileSync(`./vct-cn${hasAlarm ? "-alarm" : ""}.ics`, result.value);
    }
}

async function main() {
    const buffer = (await request.get(API_URL)).body;
    generateICS(buffer, true);
}

main();
