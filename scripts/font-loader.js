// 字体预加载脚本
// 确保自定义字体在应用启动时就开始加载

(function () {
    'use strict';

    // 预加载自定义字体
    function preloadCustomFont() {
        const fontFace = new FontFace(
            'Custom-UI',
            'url(./assets/fonts/AaGuXiLaZhangGuanKeAiDeShen-2.ttf)',
            {
                weight: 'normal',
                style: 'normal',
                display: 'swap'
            }
        );

        fontFace.load().then(function (loadedFont) {
            document.fonts.add(loadedFont);
            console.log('✅ 自定义字体加载成功');

            // 触发字体变更事件
            document.body.classList.add('font-loaded');
        }).catch(function (error) {
            console.warn('⚠️ 自定义字体加载失败，使用系统字体:', error);
            // 降级到系统字体
            document.body.classList.add('font-fallback');
        });
    }

    // 当DOM就绪时预加载字体
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', preloadCustomFont);
    } else {
        preloadCustomFont();
    }

    // 监听字体加载状态
    document.fonts.addEventListener('loadingdone', function () {
        console.log('📝 所有字体加载完成');
    });

})();
