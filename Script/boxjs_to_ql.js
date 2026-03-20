/**
 *@file       boxjs_to_ql
 *@desp       boxjs同步环境变量到多个青龙面板。
 *@env        @ql.sync_env__key, @ql.ip, @ql.port, @ql.baseUrl, @ql.client_id, @ql.client_secret, @ql.mute
 *@author     WowYiJiu & Gemini
 *@updated    2026-03-20
 *@link       https://raw.githubusercontent.com/fly818/QX/refs/heads/master/Script/boxjs_to_ql.js
 *@thanks     @dompling: https://github.com/dompling

💬 BoxJs订阅:
   https://raw.githubusercontent.com/fly818/QX/refs/heads/master/boxjs/fly818.boxjs.json

   配置项说明:
   - 支持多面板, 在 IP/端口/ID/Secret 输入框中用@分隔多个值。
   - 支持通用配置, 若端口/ID/Secret相同, 只需填写一个通用值。
    - 同步规则格式: boxjs_key#QL_ENV#备注#面板序号
      第4段可选，不填=同步全部面板，填写=只同步指定面板（逗号分隔，从1开始）
⚙ 配置 (Quantumult X)
[task_local]
0 0 * * * <YOUR_SCRIPT_URL>, tag=boxjs多面板同步, img-url=https://raw.githubusercontent.com/WowYiJiu/Personal/main/icon/Color/ql.png, enabled=true
*/

// 初始化一个API实例，用于后续的网络请求、数据读写等操作
const $ = new API("sync", true);

// 定义通知的标题
const title = "🐉 通知提示";

// 封装一个函数，用于根据不同环境（如Quantumult X）从BoxJs读取数据
$.getval = (t) => ($.env.isQX ? $prefs.valueForKey(t) : $persistentStore.read(t));

// 封装一个更高级的函数，用于获取数据，支持从JSON对象中通过路径获取值
$.getdata = (t) => {
    const lodash_get = (t, s = "", e) => s.split(/[\.\[\]]/g).filter(Boolean).reduce((res, key) => (res !== null && res !== undefined) ? res[key] : res, t) || e;
    let s = $.getval(t);
    if (/^@/.test(t)) {
        const [, e, i] = /^@(.*)\.(.*?)$/.exec(t);
        const r = e ? $.getval(e) : "";
        if (r) {
            try {
                const t = JSON.parse(r);
                s = t ? lodash_get(t, i, "") : s
            } catch (error) {
                s = ""
            }
        }
    }
    return s
};


/**
 * ----------------------------------------------------------------
 * 集成并重构后的青龙API模块 (QinglongAPI Class)
 * ----------------------------------------------------------------
 */
class QinglongAPI {
    constructor(ip, port, clientId, clientSecret, baseUrl = '') {
        this.ip = ip;
        this.port = port;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.baseUrl = baseUrl;
        // 增强URL处理，兼容用户可能输入 http/https 前缀的情况
        if (ip.startsWith('http')) {
            this.url = `${ip}:${port}${baseUrl}`;
        } else {
            this.url = `http://${ip}:${port}${baseUrl}`;
        }
        this.token = "";
        this.headers = {
            "Accept": "application/json",
            "Content-Type": "application/json;charset=UTF-8"
        };
        console.log(`初始化: ${this.url}`);
    }

    async login() {
        try {
            const opt = {
                url: `${this.url}/open/auth/token?client_id=${this.clientId}&client_secret=${this.clientSecret}`,
                headers: this.headers,
                timeout: 5000,
            };
            const resp = await $.http.get(opt);
            const data = JSON.parse(resp.body);
            if (data.code === 200 && data.data.token) {
                this.token = data.data.token;
                this.headers['Authorization'] = `Bearer ${this.token}`;
                console.log(`✅ 登录成功`);
                return true;
            } else {
                console.log(`❌ 登录失败: ${data.message || '格式不正确'}`);
                return false;
            }
        } catch (e) {
            console.log(`❌ 登录请求失败: ${e}`);
            return false;
        }
    }

    async getEnvs(searchValue = "") {
        try {
            const opt = {
                url: `${this.url}/open/envs?searchValue=${searchValue}`,
                headers: this.headers,
                timeout: 5000,
            };
            const resp = await $.http.get(opt);
            return JSON.parse(resp.body);
        } catch (e) {
            return { code: 500, message: `获取环境变量失败: ${e}` };
        }
    }

    async addEnvs(envs) {
        try {
            // 通过 map 过滤掉青龙 API 不支持的字段，如 panels
            const payload = envs.map(env => ({
                name: env.name,
                value: env.value,
                remarks: env.remarks
            }));
            const opt = {
                url: `${this.url}/open/envs`,
                headers: this.headers,
                body: JSON.stringify(payload),
                timeout: 5000,
            };
            const resp = await $.http.post(opt);
            return JSON.parse(resp.body);
        } catch (e) {
            return { code: 500, message: `新增环境变量失败: ${e}` };
        }
    }

    async updateEnv(env) {
        try {
            const body = {
                name: env.name,
                value: env.value,
                remarks: env.remarks,
                id: env.id
            };
            const opt = {
                url: `${this.url}/open/envs`,
                headers: this.headers,
                body: JSON.stringify(body),
                timeout: 5000,
            };
            const resp = await $.http.put(opt);
            return JSON.parse(resp.body);
        } catch (e) {
            return { code: 500, message: `更新环境变量失败: ${e}` };
        }
    }
}


/**
 * ----------------------------------------------------------------
 * 主执行函数
 * ----------------------------------------------------------------
 */
!(async () => {
    // 1. 读取并解析多面板配置
    console.log(`📋 读取面板配置`);
    const ips = ($.getdata('@ql.ip') || "").split('@').filter(Boolean);
    const ports = ($.getdata('@ql.port') || "").split('@').filter(Boolean);
    const clientIds = ($.getdata('@ql.client_id') || "").split('@').filter(Boolean);
    const clientSecrets = ($.getdata('@ql.client_secret') || "").split('@').filter(Boolean);
    // 读取 baseUrl，自动补开头斜杠、去掉末尾斜杠
    let baseUrl = ($.getdata('@ql.baseUrl') || "").trim();
    if (baseUrl && !baseUrl.startsWith('/')) baseUrl = '/' + baseUrl;
    baseUrl = baseUrl.replace(/\/$/, '');

    const servers = [];
    for (let i = 0; i < ips.length; i++) {
        // 智能处理配置: 使用索引为i的值,如果不存在,则使用第一个值作为通用值
        const port = ports[i] || ports[0];
        const clientId = clientIds[i] || clientIds[0];
        const clientSecret = clientSecrets[i] || clientSecrets[0];

        if (ips[i] && port && clientId && clientSecret) {
            servers.push({
                ip: ips[i],
                port: port,
                clientId: clientId,
                clientSecret: clientSecret
            });
        }
    }

    if (servers.length === 0) {
        return $.notify(title, "❌ 配置错误", "未找到任何有效的青龙面板配置，请检查BoxJs中的配置是否完整。");
    }
    console.log(`✅ ${servers.length} 个面板`);

    // 2. 读取并解析环境变量同步规则
    console.log(`\n📋 读取同步规则`);
    const envKeys = $.getdata("@ql.sync_env__key") || "";
    const syncEnvs = [];
    const envsData = envKeys.split('\n');

    for (const line of envsData) {
        const trimmedLine = line.trim();
        if (!trimmedLine || trimmedLine.startsWith('#')) continue;
        if (trimmedLine.startsWith('-')) {
            console.log(`⏸️ ${trimmedLine} 已禁用`);
            continue;
        }
        const parts = trimmedLine.split('#');
        if (parts.length < 3) {
            console.log(`⚠️ 格式不正确: ${trimmedLine}`);
            continue;
        }
        // 第4段可选：指定面板序号（逗号分隔），不填则同步到所有面板
        const panelFilter = parts[3] ? parts[3].split(',').map(n => Number(n.trim())).filter(Boolean) : [];
        syncEnvs.push({ 'BoxJsKey': parts[0], 'qlEnv': parts[1], 'qlRemark': parts[2], 'panels': panelFilter });
    }
    console.log(`✅ ${syncEnvs.length} 条规则`);


    // 3. 获取所有需要同步的变量值
    console.log(`\n📋 准备变量数据`);
    const qlData = [];
    const validate = (value, pattern) => new RegExp(pattern).test(value);

    for (const item of syncEnvs) {
        if (!validate(item.qlEnv, '^[a-zA-Z_][0-9a-zA-Z_]*$')) {
            console.log(`❌ ${item.qlRemark}: 变量名格式不正确`);
            continue;
        }
        const qlValue = $.getdata(item.BoxJsKey) || "";
        if (!qlValue) {
            console.log(`⏭️ ${item.qlRemark} 值为空，跳过`);
            continue;
        }
        qlData.push({
            name: item.qlEnv,
            value: qlValue,
            remarks: item.qlRemark,
            panels: item.panels,
        });
    }

    if (qlData.length === 0) {
        return $.notify(title, "同步完成", "没有需要同步的有效环境变量。");
    }
    console.log(`✅ ${qlData.length} 个变量待同步`);

    // 4. 遍历所有服务器，执行同步操作
    console.log(`\n🚀 开始同步`);
    let finalNotifyBodyParts = [];
    let failedPanels = [];

    for (let si = 0; si < servers.length; si++) {
        const server = servers[si];
        const panelIndex = si + 1; // 面板序号从1开始
        console.log(`\n━━━ 面板${panelIndex} ${server.ip} ━━━`);
        const ql = new QinglongAPI(server.ip, server.port, server.clientId, server.clientSecret, baseUrl);

        // 按面板序号过滤：只保留该面板需要同步的变量
        const panelData = qlData.filter(item => {
            if (!item.panels || item.panels.length === 0) return true; // 未指定面板 = 全部
            return item.panels.includes(panelIndex);
        });
        if (panelData.length === 0) {
            console.log(`⏭️ 无匹配规则，跳过`);
            finalNotifyBodyParts.push(`📡 面板${panelIndex} ${server.ip}\n  ⏭️ 无匹配规则`);
            continue;
        }
        console.log(`📦 同步 ${panelData.length}/${qlData.length} 个变量`);
        let panelResult = [`📡 面板${panelIndex} ${server.ip}`];

        if (!(await ql.login())) {
            failedPanels.push(server.ip);
            panelResult.push("  ❌ 登录失败");
            finalNotifyBodyParts.push(panelResult.join('\n'));
            console.log(`━━━ 面板${panelIndex} 完毕 ━━━`);
            continue;
        }

        try {
            const envsToUpdate = [];
            const envsToAdd = [];
            const unchangedEnvs = [];

            // 一次性获取面板所有环境变量，在本地比对，减少请求次数
            const allEnvsResp = await ql.getEnvs();
            if (allEnvsResp.code !== 200) {
                throw new Error(`获取环境变量列表失败 (code: ${allEnvsResp.code}): ${allEnvsResp.message || '未知错误'}`);
            }
            const allEnvs = allEnvsResp.data || [];

            for (const element of panelData) {
                console.log(`  → 检查 [${element.remarks}] (${element.name})`);
                const existingEnv = allEnvs.find(item => item.name === element.name);

                if (existingEnv) {
                    let diffs = [];
                    if (existingEnv.value !== element.value) diffs.push("值");
                    if (existingEnv.remarks !== element.remarks) diffs.push("备注");

                    if (diffs.length > 0) {
                        console.log(`    🔄 ${diffs.join('和')}不同，待更新`);
                        envsToUpdate.push({ ...element, id: existingEnv.id });
                    } else {
                        console.log(`    ✅ 无变化`);
                        unchangedEnvs.push(element);
                    }
                } else {
                    console.log(`    ➕ 不存在，待新增`);
                    envsToAdd.push(element);
                }
            }

            // 执行更新和新增
            if (envsToUpdate.length > 0) {
                console.log(`🔄 更新 ${envsToUpdate.length} 个`);
                for (const env of envsToUpdate) { await ql.updateEnv(env); }
            }
            if (envsToAdd.length > 0) {
                console.log(`➕ 新增 ${envsToAdd.length} 个`);
                await ql.addEnvs(envsToAdd);
            }

            // 构造当前面板的通知内容
            if (envsToUpdate.length === 0 && envsToAdd.length === 0) {
                if (unchangedEnvs.length > 0) {
                    panelResult.push(`  ✅ ${unchangedEnvs.length} 个变量均最新`);
                } else {
                    panelResult.push(`  ✅ 无需同步`);
                }
            } else {
                let summaryParts = [];
                if (envsToUpdate.length > 0) summaryParts.push(`更新 ${envsToUpdate.length} 条`);
                if (envsToAdd.length > 0) summaryParts.push(`新增 ${envsToAdd.length} 条`);
                if (unchangedEnvs.length > 0) summaryParts.push(`${unchangedEnvs.length} 条已最新`);
                panelResult.push(`  ℹ️ ${summaryParts.join('，')}`);
            }

            const updatedDetails = envsToUpdate.map(e => `  🔄 ${e.remarks}`).join('\n');
            const addedDetails = envsToAdd.map(e => `  ➕ ${e.remarks}`).join('\n');
            const unchangedDetails = unchangedEnvs.map(e => `  ✅ ${e.remarks}`).join('\n');

            const details = [updatedDetails, addedDetails, unchangedDetails].filter(Boolean).join('\n');
            if (details) {
                panelResult.push(details);
            }

        } catch (e) {
            console.log(`❌ 出错: ${e}`);
            failedPanels.push(server.ip);
            panelResult.push(`  ❌ 出错: ${e}`);
        }

        finalNotifyBodyParts.push(panelResult.join('\n'));
        console.log(`━━━ 面板${panelIndex} 完毕 ━━━`);
    }

    // 5. 发送最终的汇总通知
    console.log(`\n📢 发送通知`);

    let notifySubtitle = '同步任务执行完毕';
    let notifyBody = finalNotifyBodyParts.join('\n\n');

    if (failedPanels.length > 0) {
        notifyBody += `\n\n❌[失败面板]\n${failedPanels.join('\n')}`;
    }

    if ($.getdata("@ql.mute") !== "true") {
        console.log(`\n${notifySubtitle}\n${notifyBody}`);
        $.notify(title, notifySubtitle, notifyBody);
    } else {
        $.info("已开启静音模式，不发送通知。");
    }

})().catch((e) => $.error(e)).finally(() => $.done());


/* prettier-ignore */
// 以下是通用的跨平台脚本运行环境兼容库，由作者提供，无需修改。
function ENV() { const isJSBox = typeof require == "function" && typeof $jsbox != "undefined"; return { isQX: typeof $task !== "undefined", isLoon: typeof $loon !== "undefined", isSurge: typeof $httpClient !== "undefined" && typeof $utils !== "undefined", isBrowser: typeof document !== "undefined", isNode: typeof require == "function" && !isJSBox, isJSBox, isRequest: typeof $request !== "undefined", isScriptable: typeof importModule !== "undefined", isShadowrocket: "undefined" !== typeof $rocket, isStash: "undefined" !== typeof $environment && $environment["stash-version"], } }
/* prettier-ignore */
function HTTP(defaultOptions = { baseURL: "" }) { const { isQX, isLoon, isSurge, isScriptable, isNode, isBrowser, isShadowrocket, isStash, } = ENV(); const methods = ["GET", "POST", "PUT", "DELETE", "HEAD", "OPTIONS", "PATCH"]; const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/; function send(method, options) { options = typeof options === "string" ? { url: options } : options; const baseURL = defaultOptions.baseURL; if (baseURL && !URL_REGEX.test(options.url || "")) { options.url = baseURL ? baseURL + options.url : options.url } if (options.body && options.headers && !options.headers["Content-Type"]) { options.headers["Content-Type"] = "application/x-www-form-urlencoded" } options = { ...defaultOptions, ...options }; const timeout = options.timeout; const events = { ...{ onRequest: () => { }, onResponse: (resp) => resp, onTimeout: () => { }, }, ...options.events, }; events.onRequest(method, options); let worker; if (isQX) { const qxOptions = { ...options }; if (!qxOptions.opts) { qxOptions.opts = {} } Object.assign(qxOptions.opts, { hints: false }); worker = $task.fetch({ method, ...qxOptions }) } else if (isLoon || isSurge || isNode || isShadowrocket || isStash) { worker = new Promise((resolve, reject) => { const request = isNode ? require("request") : $httpClient; request[method.toLowerCase()](options, (err, response, body) => { if (err) reject(err); else resolve({ statusCode: response.status || response.statusCode, headers: response.headers, body, }) }) }) } else if (isScriptable) { const request = new Request(options.url); request.method = method; request.headers = options.headers; request.body = options.body; worker = new Promise((resolve, reject) => { request.loadString().then((body) => { resolve({ statusCode: request.response.statusCode, headers: request.response.headers, body, }) }).catch((err) => reject(err)) }) } else if (isBrowser) { worker = new Promise((resolve, reject) => { fetch(options.url, { method, headers: options.headers, body: options.body, }).then((response) => response.json()).then((response) => resolve({ statusCode: response.status, headers: response.headers, body: response.data, })).catch(reject) }) } let timeoutid; const timer = timeout ? new Promise((_, reject) => { timeoutid = setTimeout(() => { events.onTimeout(); return reject(`${method}URL:${options.url}exceeds the timeout ${timeout}ms`) }, timeout) }) : null; return (timer ? Promise.race([timer, worker]).then((res) => { clearTimeout(timeoutid); return res }) : worker).then((resp) => events.onResponse(resp)) } const http = {}; methods.forEach((method) => (http[method.toLowerCase()] = (options) => send(method, options))); return http }
/* prettier-ignore */
function API(name = "untitled", debug = false) { const { isQX, isLoon, isSurge, isScriptable, isNode, isShadowrocket, isStash, } = ENV(); return new (class { constructor(name, debug) { this.name = name; this.debug = debug; this.http = HTTP(); this.env = ENV(); this.node = (() => { if (isNode) { const fs = require("fs"); return { fs } } else { return null } })(); this.initCache(); const delay = (t, v) => new Promise(function (resolve) { setTimeout(resolve.bind(null, v), t) }); Promise.prototype.delay = function (t) { return this.then(function (v) { return delay(t, v) }) } } initCache() { if (isQX) this.cache = JSON.parse($prefs.valueForKey(this.name) || "{}"); if (isLoon || isSurge) this.cache = JSON.parse($persistentStore.read(this.name) || "{}"); if (isNode) { let fpath = "root.json"; if (!this.node.fs.existsSync(fpath)) { this.node.fs.writeFileSync(fpath, JSON.stringify({}), { flag: "wx" }, (err) => console.log(err)) } this.root = {}; fpath = `${this.name}.json`; if (!this.node.fs.existsSync(fpath)) { this.node.fs.writeFileSync(fpath, JSON.stringify({}), { flag: "wx" }, (err) => console.log(err)); this.cache = {} } else { this.cache = JSON.parse(this.node.fs.readFileSync(`${this.name}.json`)) } } } persistCache() { const data = JSON.stringify(this.cache, null, 2); if (isQX) $prefs.setValueForKey(data, this.name); if (isLoon || isSurge || isStash || isShadowrocket) $persistentStore.write(data, this.name); if (isNode) { this.node.fs.writeFileSync(`${this.name}.json`, data, { flag: "w" }, (err) => console.log(err)); this.node.fs.writeFileSync("root.json", JSON.stringify(this.root, null, 2), { flag: "w" }, (err) => console.log(err)) } } write(data, key) { this.log(`SET ${key}`); if (key.indexOf("#") !== -1) { key = key.substr(1); if (isLoon || isSurge || isStash || isShadowrocket) { return $persistentStore.write(data, key) } if (isQX) { return $prefs.setValueForKey(data, key) } if (isNode) { this.root[key] = data } } else { this.cache[key] = data } this.persistCache() } read(key) { if (key.indexOf("#") !== -1) { key = key.substr(1); if (isLoon || isSurge || isStash || isShadowrocket) { return $persistentStore.read(key) } if (isQX) { return $prefs.valueForKey(key) } if (isNode) { return this.root[key] } } else { return this.cache[key] } } delete(key) { this.log(`DELETE ${key}`); if (key.indexOf("#") !== -1) { key = key.substr(1); if (isLoon || isSurge || isStash || isShadowrocket) { return $persistentStore.write(null, key) } if (isQX) { return $prefs.removeValueForKey(key) } if (isNode) { delete this.root[key] } } else { delete this.cache[key] } this.persistCache() } notify(title, subtitle = "", content = "", options = {}) { const openURL = options["open-url"]; const mediaURL = options["media-url"]; if (isQX) $notify(title, subtitle, content, options); if (isSurge) { $notification.post(title, subtitle, content + `${mediaURL ? "\n多媒体:" + mediaURL : ""}`, { url: openURL }) } if (isLoon || isStash || isShadowrocket) { let opts = {}; if (openURL) opts["openUrl"] = openURL; if (mediaURL) opts["mediaUrl"] = mediaURL; if (JSON.stringify(opts) === "{}") { $notification.post(title, subtitle, content) } else { $notification.post(title, subtitle, content, opts) } } if (isNode || isScriptable) { const content_ = content + (openURL ? `\n点击跳转:${openURL}` : "") + (mediaURL ? `\n多媒体:${mediaURL}` : ""); if (isJSBox) { const push = require("push"); push.schedule({ title: title, body: (subtitle ? subtitle + "\n" : "") + content_, }) } else { console.log(`${title}\n${subtitle}\n${content_}\n\n`) } } } log(msg) { if (this.debug) console.log(`[${this.name}]LOG:${this.stringify(msg)}`) } info(msg) { console.log(`[${this.name}]INFO:${this.stringify(msg)}`) } error(msg) { console.log(`[${this.name}]ERROR:${this.stringify(msg)}`) } wait(millisec) { return new Promise((resolve) => setTimeout(resolve, millisec)) } done(value = {}) { if (isQX || isLoon || isSurge || isStash || isShadowrocket) { $done(value) } else if (isNode && !isJSBox) { if (typeof $context !== "undefined") { $context.headers = value.headers; $context.statusCode = value.statusCode; $context.body = value.body } } } stringify(obj_or_str) { if (typeof obj_or_str === "string" || obj_or_str instanceof String) return obj_or_str; else try { return JSON.stringify(obj_or_str, null, 2) } catch (err) { return "[object Object]" } } })(name, debug) }
