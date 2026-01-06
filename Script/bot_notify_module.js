/**
 * Bot 通知模块 (通用版 v1.4 - 支持动态加载)
 * ==============================================================================
 * 功能：调用 Bot /notify API，支持广播和频道两种模式
 * 
 * 【v1.4 更新 - 支持动态加载】
 *    - 所有 const 改为 var，确保 eval() 后能暴露到全局作用域
 *    - 所有 function 声明改为 var = function，兼容 QX 的 eval 环境
 *    - 现在可以通过 $.getScript() + eval() 动态加载此模块
 * 
 * 【使用方法】
 * 方法1: 将此模块代码复制到你的脚本中（放在 Env 模块之前）
 * 方法2: 动态加载（参考 ftej.js 的 CryptoJS 加载模式）
 *        var jsCode = await $.getScript('模块URL');
 *        eval(jsCode);
 *        await notifyBot('标题', '内容');
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
 * ==============================================================================
 */

// ===================== Bot 通知模块 - 开始 =====================

// ==================== 配置区（使用 var 确保 eval 后能暴露）====================

// API 地址：你的 Bot Worker 的 /notify 端点
var BOT_NOTIFY_URL = $.getdata('bot_notify_url') || 'https://你的Bot域名/notify';

// 认证密钥：必须与 Bot 的 ENV_BOT_SECRET 环境变量一致
var BOT_SECRET = $.getdata('bot_secret') || '';

// 默认通知模式：broadcast / channel / both
var BOT_NOTIFY_MODE = $.getdata('bot_notify_mode') || 'broadcast';

// 请求超时时间（毫秒）
var BOT_NOTIFY_TIMEOUT = 10000;

// 失败重试次数
var BOT_NOTIFY_RETRY = 1;


// ==================== 工具函数（使用 var = function 确保暴露）====================

/**
 * 检查 URL 配置是否有效
 */
var isUrlConfigured = function () {
    if (!BOT_NOTIFY_URL || BOT_NOTIFY_URL.includes('你的Bot域名')) {
        $.log('⚠️ 请先配置 bot_notify_url');
        return false;
    }
    return true;
};


// ==================== 核心函数 ====================

/**
 * 发送单条通知（内部函数）
 */
var sendNotify = async function (title, content, mode, retryCount) {
    if (typeof retryCount === 'undefined') retryCount = 0;

    return new Promise(function (resolve) {
        var opts = {
            url: BOT_NOTIFY_URL,
            method: 'POST',
            timeout: BOT_NOTIFY_TIMEOUT,
            headers: {
                'Authorization': 'Bearer ' + BOT_SECRET,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ title: title, content: content, mode: mode })
        };

        $.post(opts, async function (err, resp, data) {
            try {
                if (err) {
                    if (retryCount < BOT_NOTIFY_RETRY) {
                        $.log('⚠️ ' + mode + ' 通知失败，正在重试 (' + (retryCount + 1) + '/' + BOT_NOTIFY_RETRY + ')...');
                        await $.wait(1000);
                        var retryResult = await sendNotify(title, content, mode, retryCount + 1);
                        resolve(retryResult);
                        return;
                    }
                    $.log('❌ ' + mode + ' 通知失败: ' + err);
                    resolve({ ok: false, error: String(err) });
                    return;
                }

                var result = JSON.parse(data);
                if (result.ok) {
                    if (result.mode === 'channel') {
                        $.log('✅ 频道通知成功');
                    } else {
                        $.log('✅ 广播成功: ' + result.success + '人');
                    }
                    resolve(result);
                } else {
                    $.log('❌ ' + mode + ' 通知失败: ' + result.error);
                    resolve({ ok: false, error: result.error });
                }
            } catch (e) {
                if (retryCount < BOT_NOTIFY_RETRY) {
                    $.log('⚠️ 响应解析失败，正在重试...');
                    await $.wait(1000);
                    var retryResult = await sendNotify(title, content, mode, retryCount + 1);
                    resolve(retryResult);
                    return;
                }
                $.log('❌ 响应解析失败');
                resolve({ ok: false, error: '响应解析失败' });
            }
        });
    });
};


/**
 * 发送通知到 Bot（主函数）
 * @param {string} title - 通知标题
 * @param {string} content - 通知内容
 * @param {string} [mode] - 可选，通知模式：broadcast/channel/both
 */
var notifyBot = async function (title, content, mode) {
    // 前置检查
    if (!BOT_SECRET) {
        $.log('⚠️ 未配置 bot_secret，跳过 Bot 通知');
        return { ok: false, error: '未配置 bot_secret' };
    }
    if (!isUrlConfigured()) {
        return { ok: false, error: 'URL 未配置' };
    }

    var targetMode = mode || BOT_NOTIFY_MODE;
    var results = [];

    if (targetMode === 'both') {
        var channelResult = await sendNotify(title, content, 'channel');
        results.push({ mode: 'channel', ok: channelResult.ok, error: channelResult.error });

        var broadcastResult = await sendNotify(title, content, 'broadcast');
        results.push({ mode: 'broadcast', ok: broadcastResult.ok, error: broadcastResult.error });

        var anySuccess = results.some(function (r) { return r.ok; });
        return { ok: anySuccess, results: results };
    } else {
        var result = await sendNotify(title, content, targetMode);
        return result;
    }
};

// ===================== Bot 通知模块 - 结束 =====================
