/**
 * Bot 通知模块 (通用版 v1.5 - 动态加载专用)
 * ==============================================================================
 * 关键改动：使用 IIFE + this 将变量暴露到全局，兼容 QX 的 eval() 环境
 * 参考 CryptoJS 的全局暴露方式
 * ==============================================================================
 */

(function (root) {
    'use strict';

    // ==================== 暴露到全局的变量 ====================

    // 配置变量
    root.BOT_NOTIFY_URL = $.getdata('bot_notify_url') || '';
    root.BOT_SECRET = $.getdata('bot_secret') || '';
    root.BOT_NOTIFY_MODE = $.getdata('bot_notify_mode') || 'broadcast';
    root.BOT_NOTIFY_TIMEOUT = 10000;
    root.BOT_NOTIFY_RETRY = 1;

    // 检查配置
    root.isUrlConfigured = function () {
        if (!root.BOT_NOTIFY_URL || root.BOT_NOTIFY_URL.includes('你的Bot域名')) {
            $.log('⚠️ 请先配置 bot_notify_url');
            return false;
        }
        return true;
    };

    // 发送单条通知
    root.sendNotify = async function (title, content, mode, retryCount) {
        if (typeof retryCount === 'undefined') retryCount = 0;

        return new Promise(function (resolve) {
            var opts = {
                url: root.BOT_NOTIFY_URL,
                method: 'POST',
                timeout: root.BOT_NOTIFY_TIMEOUT,
                headers: {
                    'Authorization': 'Bearer ' + root.BOT_SECRET,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ title: title, content: content, mode: mode })
            };

            $.post(opts, async function (err, resp, data) {
                try {
                    if (err) {
                        if (retryCount < root.BOT_NOTIFY_RETRY) {
                            $.log('⚠️ ' + mode + ' 通知失败，正在重试...');
                            await $.wait(1000);
                            var retryResult = await root.sendNotify(title, content, mode, retryCount + 1);
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
                    if (retryCount < root.BOT_NOTIFY_RETRY) {
                        $.log('⚠️ 响应解析失败，正在重试...');
                        await $.wait(1000);
                        var retryResult = await root.sendNotify(title, content, mode, retryCount + 1);
                        resolve(retryResult);
                        return;
                    }
                    $.log('❌ 响应解析失败');
                    resolve({ ok: false, error: '响应解析失败' });
                }
            });
        });
    };

    // 主函数：发送通知到 Bot
    root.notifyBot = async function (title, content, mode) {
        if (!root.BOT_SECRET) {
            $.log('⚠️ 未配置 bot_secret，跳过 Bot 通知');
            return { ok: false, error: '未配置 bot_secret' };
        }
        if (!root.isUrlConfigured()) {
            return { ok: false, error: 'URL 未配置' };
        }

        var targetMode = mode || root.BOT_NOTIFY_MODE;
        var results = [];

        if (targetMode === 'both') {
            var channelResult = await root.sendNotify(title, content, 'channel');
            results.push({ mode: 'channel', ok: channelResult.ok, error: channelResult.error });

            var broadcastResult = await root.sendNotify(title, content, 'broadcast');
            results.push({ mode: 'broadcast', ok: broadcastResult.ok, error: broadcastResult.error });

            var anySuccess = results.some(function (r) { return r.ok; });
            return { ok: anySuccess, results: results };
        } else {
            var result = await root.sendNotify(title, content, targetMode);
            return result;
        }
    };

})(this);

// ===================== Bot 通知模块 v1.5 加载完成 =====================
