/**
 * Bot 通知模块 (通用版 v1.3)
 * ==============================================================================
 * 功能：调用 Bot /notify API，支持广播和频道两种模式
 * 
 * 【使用方法】
 * 1. 将此模块代码复制到你的脚本中（放在 Env 模块之前）
 * 2. 配置 BOT_NOTIFY_URL 和 BOT_SECRET（通过 BoxJs 或直接修改下方常量）
 * 3. 在需要发送通知的地方调用 notifyBot 函数
 * 
 * 【调用示例】
 *    await notifyBot('标题', '内容');              // 使用默认模式
 *    await notifyBot('标题', '内容', 'channel');   // 频道模式
 *    await notifyBot('标题', '内容', 'broadcast'); // 广播模式
 *    await notifyBot('标题', '内容', 'both');      // 同时发两种
 * 
 * 【返回值】 
 *    { ok: true, mode: 'broadcast', success: 10 }  // 成功
 *    { ok: false, error: '错误信息' }              // 失败
 * 
 * 【BoxJs 配置项】
 *    bot_notify_url   - API 地址 (如: https://your-bot.workers.dev/notify)
 *    bot_secret       - 认证密钥 (与 Bot 的 ENV_BOT_SECRET 一致)
 *    bot_notify_mode  - 默认通知模式 (broadcast/channel/both)
 * 
 * 【v1.3 更新】
 *    - 新增：请求超时处理（10秒）
 *    - 新增：失败自动重试（1次）
 *    - 新增：URL 配置检查
 *    - 新增：返回发送结果
 * ==============================================================================
 */

// ===================== Bot 通知模块 - 开始 =====================

// ==================== 配置区（可通过 BoxJs 覆盖）====================

/**
 * API 地址：你的 Bot Worker 的 /notify 端点
 * 优先从 BoxJs 读取，否则使用默认值
 * BoxJs Key: bot_notify_url
 */
const BOT_NOTIFY_URL = $.getdata('bot_notify_url') || 'https://你的Bot域名/notify';

/**
 * 认证密钥：必须与 Bot 的 ENV_BOT_SECRET 环境变量一致
 * 用于 API 请求的 Bearer Token 认证
 * BoxJs Key: bot_secret
 */
const BOT_SECRET = $.getdata('bot_secret') || '';

/**
 * 默认通知模式：
 * - broadcast: 广播给所有订阅用户
 * - channel: 发送到指定的 Telegram 频道
 * - both: 同时发送到频道和广播给用户
 * BoxJs Key: bot_notify_mode
 */
const BOT_NOTIFY_MODE = $.getdata('bot_notify_mode') || 'broadcast';

// ==================== 高级配置（一般无需修改）====================

/**
 * 请求超时时间（毫秒）
 * 超过此时间未收到响应则视为失败
 */
const BOT_NOTIFY_TIMEOUT = 10000;  // 10秒

/**
 * 失败重试次数
 * 网络错误或响应解析失败时自动重试的次数
 */
const BOT_NOTIFY_RETRY = 1;        // 重试1次


// ==================== 工具函数 ====================

/**
 * 检查 URL 配置是否有效
 * 防止用户忘记配置导致请求发到占位符地址
 * @returns {boolean} true=配置有效，false=需要配置
 */
function isUrlConfigured() {
    // 检查是否为空或仍是默认占位符
    if (!BOT_NOTIFY_URL || BOT_NOTIFY_URL.includes('你的Bot域名')) {
        $.log('⚠️ 请先配置 bot_notify_url');
        $.log('   方式1: 在 BoxJs 中设置 bot_notify_url');
        $.log('   方式2: 直接修改脚本中的 BOT_NOTIFY_URL 常量');
        return false;
    }
    return true;
}


// ==================== 核心函数 ====================

/**
 * 发送单条通知（内部函数）
 * 支持超时和失败重试
 * 
 * @param {string} title - 通知标题
 * @param {string} content - 通知内容
 * @param {string} mode - 通知模式 ('broadcast' 或 'channel')
 * @param {number} retryCount - 当前已重试次数（内部使用）
 * @returns {Promise<{ok: boolean, mode?: string, success?: number, error?: string}>}
 */
async function sendNotify(title, content, mode, retryCount = 0) {
    return new Promise((resolve) => {
        // 构造 HTTP POST 请求选项
        const opts = {
            url: BOT_NOTIFY_URL,           // 请求地址
            method: 'POST',                 // 请求方法
            timeout: BOT_NOTIFY_TIMEOUT,    // 超时设置
            headers: {
                // Bearer Token 认证，格式: "Bearer xxx"
                'Authorization': `Bearer ${BOT_SECRET}`,
                'Content-Type': 'application/json'
            },
            // 请求体：包含标题、内容和模式
            body: JSON.stringify({ title, content, mode })
        };

        // 发送 POST 请求
        $.post(opts, async (err, resp, data) => {
            try {
                // ====== 错误处理：网络错误/超时 ======
                if (err) {
                    // 检查是否还有重试次数
                    if (retryCount < BOT_NOTIFY_RETRY) {
                        $.log(`⚠️ ${mode} 通知失败，正在重试 (${retryCount + 1}/${BOT_NOTIFY_RETRY})...`);
                        await $.wait(1000); // 等待1秒后重试，避免立即重试
                        // 递归调用自身进行重试
                        const retryResult = await sendNotify(title, content, mode, retryCount + 1);
                        resolve(retryResult);
                        return;
                    }
                    // 重试次数用完，返回失败
                    $.log(`❌ ${mode} 通知失败: ${err}`);
                    resolve({ ok: false, error: String(err) });
                    return;
                }

                // ====== 解析响应 ======
                const result = JSON.parse(data);

                // ====== 成功处理 ======
                if (result.ok) {
                    // 根据模式显示不同的成功日志
                    if (result.mode === 'channel') {
                        $.log(`✅ 频道通知成功`);
                    } else {
                        $.log(`✅ 广播成功: ${result.success}人`);
                    }
                    // 返回 API 的完整响应
                    resolve(result);
                } else {
                    // API 返回了错误（如认证失败、频道不存在等）
                    $.log(`❌ ${mode} 通知失败: ${result.error}`);
                    resolve({ ok: false, error: result.error });
                }
            } catch (e) {
                // ====== JSON 解析失败 ======
                // 可能是响应格式错误或网络中断
                if (retryCount < BOT_NOTIFY_RETRY) {
                    $.log(`⚠️ 响应解析失败，正在重试...`);
                    await $.wait(1000);
                    const retryResult = await sendNotify(title, content, mode, retryCount + 1);
                    resolve(retryResult);
                    return;
                }
                $.log('❌ 响应解析失败');
                resolve({ ok: false, error: '响应解析失败' });
            }
        });
    });
}


/**
 * 发送通知到 Bot（主函数）
 * 
 * 模式判断优先级：调用时指定 > BoxJs 配置 > 默认值('broadcast')
 * 
 * @param {string} title - 通知标题（Bot 端会加粗显示）
 * @param {string} content - 通知内容
 * @param {string} [mode] - 可选，通知模式：
 *                          - 'broadcast': 广播给所有订阅用户
 *                          - 'channel': 发送到配置的频道
 *                          - 'both': 同时发送两种
 *                          - 不传: 使用 BOT_NOTIFY_MODE 配置
 * @returns {Promise<{ok: boolean, results?: object[], error?: string}>}
 *          返回发送结果对象，可用于判断是否成功
 * 
 * @example
 * // 基础用法
 * await notifyBot('签到成功', '获得 10 积分');
 * 
 * @example
 * // 获取返回结果
 * const result = await notifyBot('有货了！', '库存: 5', 'channel');
 * if (result.ok) {
 *     console.log('通知发送成功');
 * } else {
 *     console.log('失败原因: ' + result.error);
 * }
 */
async function notifyBot(title, content, mode = null) {
    // ====== 前置检查：密钥配置 ======
    if (!BOT_SECRET) {
        $.log('⚠️ 未配置 bot_secret，跳过 Bot 通知');
        return { ok: false, error: '未配置 bot_secret' };
    }

    // ====== 前置检查：URL 配置 ======
    if (!isUrlConfigured()) {
        return { ok: false, error: 'URL 未配置' };
    }

    // 确定使用的模式：优先使用传入的 mode，否则使用配置的默认模式
    const targetMode = mode || BOT_NOTIFY_MODE;

    // 存储多个结果（用于 both 模式）
    const results = [];

    // ====== 根据模式发送通知 ======
    if (targetMode === 'both') {
        // both 模式：两种方式都发送

        // 1. 先发送到频道
        const channelResult = await sendNotify(title, content, 'channel');
        results.push({ mode: 'channel', ...channelResult });

        // 2. 再广播给用户
        const broadcastResult = await sendNotify(title, content, 'broadcast');
        results.push({ mode: 'broadcast', ...broadcastResult });

        // 只要有一个成功就算整体成功
        const anySuccess = results.some(r => r.ok);
        return { ok: anySuccess, results };
    } else {
        // 单一模式：直接发送
        const result = await sendNotify(title, content, targetMode);
        return result;
    }
}

// ===================== Bot 通知模块 - 结束 =====================