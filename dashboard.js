/**
 * dashboard.js
 * 데이터 시각화, 차트 제어, 실시간 알고리즘 파이프라인 및 인터랙션 컨트롤러
 */

document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    // 1. 데이터 검증 및 글로벌 데이터 세팅
    if (typeof RAW_SENSOR_DATA === 'undefined' || !Array.isArray(RAW_SENSOR_DATA)) {
        console.error('RAW_SENSOR_DATA 가 로드되지 않았습니다.');
        return;
    }

    const data = RAW_SENSOR_DATA;
    const n = data.length;

    // 데이터 시리즈 추출
    const timeMinutes = data.map(d => d.min);
    const timeHours = data.map(d => d.hour.toFixed(2));
    const labels = data.map(d => {
        const h = Math.floor(d.min / 60).toString().padStart(2, '0');
        const m = (d.min % 60).toString().padStart(2, '0');
        return `${h}:${m}`;
    });

    const rawTemp = data.map(d => d.temp_raw);
    const trueTemp = data.map(d => d.temp_true);
    const vibRms = data.map(d => d.vib_rms);
    const pressure = data.map(d => d.pressure);
    const events = data.map(d => d.event);

    // 차트 인스턴스 캐시
    const charts = {};

    // 2. 테마 관리
    const themeBtn = document.getElementById('themeToggle');
    let currentTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', currentTheme);

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', currentTheme);
            localStorage.setItem('theme', currentTheme);
            themeBtn.innerHTML = currentTheme === 'dark' ? '☀️ 라이트 모드' : '🌙 다크 모드';
            // 모든 차트 테마 색상 갱신
            updateChartsTheme();
        });
    }

    function getThemeColors() {
        const isLight = document.documentElement.getAttribute('data-theme') === 'light';
        return {
            textColor: isLight ? '#475569' : '#94a3b8',
            gridColor: isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)',
            tooltipBg: isLight ? 'rgba(255,255,255,0.95)' : 'rgba(15,23,42,0.95)',
            tooltipText: isLight ? '#0f172a' : '#f8fafc'
        };
    }

    function updateChartsTheme() {
        const tc = getThemeColors();
        Object.values(charts).forEach(chart => {
            if (!chart) return;
            if (chart.options.scales) {
                Object.values(chart.options.scales).forEach(scale => {
                    if (scale.ticks) scale.ticks.color = tc.textColor;
                    if (scale.grid) scale.grid.color = tc.gridColor;
                });
            }
            if (chart.options.plugins && chart.options.plugins.legend) {
                chart.options.plugins.legend.labels.color = tc.textColor;
            }
            chart.update();
        });
    }

    // 3. 탭 내비게이션
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-tab');
            const targetPane = document.getElementById(targetId);
            if (targetPane) targetPane.classList.add('active');

            // 탭 활성화 시 차트 리사이즈 갱신
            setTimeout(() => {
                window.dispatchEvent(new Event('resize'));
            }, 50);
        });
    });

    // 4. 초기 KPI 카드 계산 및 렌더링
    function initKPIs() {
        document.getElementById('kpiTotalRecords').textContent = `${n.toLocaleString()} 개`;
        
        // 원시값 에러
        const rawEval = SensorAlgorithms.evaluateMetrics(rawTemp, trueTemp, rawTemp);
        document.getElementById('kpiRawRmse').textContent = `${rawEval.rmse.toFixed(3)} °C`;
        document.getElementById('kpiRawR2').textContent = `R²: ${rawEval.r2.toFixed(3)}`;

        // 비정상 이벤트 합산
        const anomalyCounts = events.filter(e => e !== '정상').length;
        document.getElementById('kpiAnomalies').textContent = `${anomalyCounts} 건`;
        
        // 스무딩 최적 알고리즘 판별 (기본 파라미터)
        const sg = SensorAlgorithms.savitzkyGolay(rawTemp, 15);
        const sgEval = SensorAlgorithms.evaluateMetrics(sg, trueTemp, rawTemp);
        const errReduction = ((rawEval.rmse - sgEval.rmse) / rawEval.rmse * 100).toFixed(1);
        
        document.getElementById('kpiBestAlgo').textContent = `Savitzky-Golay`;
        document.getElementById('kpiBestImprovement').textContent = `오차 ${errReduction}% 감소 (RMSE ${sgEval.rmse.toFixed(3)}°C)`;
    }

    // 5. [탭 1] 스무딩 & 필터링 벤치마크 차트 및 컨트롤러
    let smoothingChart = null;

    function initSmoothingTab() {
        const windowSlider = document.getElementById('smoothingWindow');
        const windowValSpan = document.getElementById('smoothingWindowVal');
        const chkRaw = document.getElementById('chkRaw');
        const chkTrue = document.getElementById('chkTrue');
        const chkSMA = document.getElementById('chkSMA');
        const chkEMA = document.getElementById('chkEMA');
        const chkSG = document.getElementById('chkSG');
        const chkGauss = document.getElementById('chkGauss');
        const chkEnv = document.getElementById('chkEnv');

        function updateSmoothing() {
            const win = parseInt(windowSlider.value, 10);
            windowValSpan.textContent = `${win} 분`;

            // 알고리즘 계산
            const smaData = SensorAlgorithms.sma(rawTemp, win);
            const emaData = SensorAlgorithms.ema(rawTemp, win);
            const sgData = SensorAlgorithms.savitzkyGolay(rawTemp, win);
            const gaussData = SensorAlgorithms.gaussianFilter(rawTemp, win / 5);
            const envData = SensorAlgorithms.peakEnvelopes(rawTemp, win * 2);

            // 벤치마크 테이블 갱신
            const algos = [
                { name: '원시 센서값 (Raw)', data: rawTemp, color: '#94a3b8', type: 'raw' },
                { name: `단순 이동평균 (SMA-${win})`, data: smaData, color: '#3b82f6', type: 'sma' },
                { name: `지수 이동평균 (EMA-${win})`, data: emaData, color: '#10b981', type: 'ema' },
                { name: `사비츠키-골레이 (SG-${win})`, data: sgData, color: '#f59e0b', type: 'sg' },
                { name: `가우시안 필터 (σ=${(win/5).toFixed(1)})`, data: gaussData, color: '#8b5cf6', type: 'gauss' }
            ];

            const tbody = document.getElementById('benchmarkTableBody');
            tbody.innerHTML = '';

            const results = algos.map(item => {
                const metrics = SensorAlgorithms.evaluateMetrics(item.data, trueTemp, rawTemp);
                const lagInfo = SensorAlgorithms.analyzePhaseLag(item.data, trueTemp);
                return { ...item, ...metrics, ...lagInfo };
            });

            // RMSE 기준 오름차순 정렬 (원시값 제외 후 정렬)
            const sorted = [...results.slice(1)].sort((a, b) => a.rmse - b.rmse);
            const finalOrder = [results[0], ...sorted];

            finalOrder.forEach((r, idx) => {
                const tr = document.createElement('tr');
                if (idx === 1) tr.classList.add('best-row'); // 최우수 알고리즘

                const rankBadge = idx === 0 ? '-' : `<span class="rank-badge rank-${idx}">${idx}</span>`;
                tr.innerHTML = `
                    <td>${rankBadge}</td>
                    <td style="font-weight:600; color:${r.color}">${r.name}</td>
                    <td><strong>${r.rmse.toFixed(3)}</strong> °C</td>
                    <td>${r.mae.toFixed(3)} °C</td>
                    <td>${r.r2.toFixed(4)}</td>
                    <td>+${r.snrGainDb.toFixed(2)} dB</td>
                    <td>${r.lagMinutes} 분 지연</td>
                    <td>${r.ampPreservation ? r.ampPreservation.toFixed(1) + '%' : '-'}</td>
                `;
                tbody.appendChild(tr);
            });

            // 차트 데이터셋 구성
            const datasets = [];

            if (chkRaw.checked) {
                datasets.push({
                    label: '온도센서 원시값',
                    data: rawTemp,
                    borderColor: 'rgba(148, 163, 184, 0.45)',
                    borderWidth: 1.2,
                    pointRadius: 0,
                    tension: 0.1
                });
            }

            if (chkTrue.checked) {
                datasets.push({
                    label: '온도 참값 (Ground Truth)',
                    data: trueTemp,
                    borderColor: '#ffffff',
                    borderWidth: 2.2,
                    borderDash: [4, 4],
                    pointRadius: 0,
                    tension: 0.1
                });
            }

            if (chkSMA.checked) {
                datasets.push({
                    label: `SMA (${win}분)`,
                    data: smaData,
                    borderColor: '#3b82f6',
                    borderWidth: 1.8,
                    pointRadius: 0,
                    tension: 0.2
                });
            }

            if (chkEMA.checked) {
                datasets.push({
                    label: `EMA (${win}분)`,
                    data: emaData,
                    borderColor: '#10b981',
                    borderWidth: 1.8,
                    pointRadius: 0,
                    tension: 0.2
                });
            }

            if (chkSG.checked) {
                datasets.push({
                    label: `Savitzky-Golay (${win}차수 2)`,
                    data: sgData,
                    borderColor: '#f59e0b',
                    borderWidth: 2.2,
                    pointRadius: 0,
                    tension: 0.2
                });
            }

            if (chkGauss.checked) {
                datasets.push({
                    label: `가우시안 (σ=${(win/5).toFixed(1)})`,
                    data: gaussData,
                    borderColor: '#8b5cf6',
                    borderWidth: 1.8,
                    pointRadius: 0,
                    tension: 0.2
                });
            }

            if (chkEnv.checked) {
                datasets.push({
                    label: '상단 포락선 (Upper Envelope)',
                    data: envData.upper,
                    borderColor: 'rgba(244, 63, 94, 0.7)',
                    borderWidth: 1.5,
                    borderDash: [2, 2],
                    pointRadius: 0,
                    fill: '+1',
                    backgroundColor: 'rgba(244, 63, 94, 0.05)'
                });
                datasets.push({
                    label: '하단 포락선 (Lower Envelope)',
                    data: envData.lower,
                    borderColor: 'rgba(6, 182, 212, 0.7)',
                    borderWidth: 1.5,
                    borderDash: [2, 2],
                    pointRadius: 0,
                    fill: false
                });
            }

            const tc = getThemeColors();

            if (!smoothingChart) {
                const ctx = document.getElementById('smoothingChartCanvas').getContext('2d');
                smoothingChart = new Chart(ctx, {
                    type: 'line',
                    data: { labels, datasets },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: 'index', intersect: false },
                        scales: {
                            x: {
                                grid: { color: tc.gridColor },
                                ticks: { color: tc.textColor, maxTicksLimit: 24 }
                            },
                            y: {
                                title: { display: true, text: '온도 (°C)', color: tc.textColor },
                                grid: { color: tc.gridColor },
                                ticks: { color: tc.textColor }
                            }
                        },
                        plugins: {
                            legend: { position: 'top', labels: { color: tc.textColor, boxWidth: 14 } },
                            tooltip: {
                                backgroundColor: tc.tooltipBg,
                                titleColor: tc.tooltipText,
                                bodyColor: tc.tooltipText
                            }
                        }
                    }
                });
                charts['smoothing'] = smoothingChart;
            } else {
                smoothingChart.data.datasets = datasets;
                smoothingChart.update('none');
            }
        }

        windowSlider.addEventListener('input', updateSmoothing);
        [chkRaw, chkTrue, chkSMA, chkEMA, chkSG, chkGauss, chkEnv].forEach(chk => {
            chk.addEventListener('change', updateSmoothing);
        });

        updateSmoothing();
    }

    // 6. [탭 2] 이상치 탐지 및 임펄스 노이즈 차트
    let anomalyChart = null;

    function initAnomalyTab() {
        const nSigmaSlider = document.getElementById('hampelSigma');
        const nSigmaSpan = document.getElementById('hampelSigmaVal');

        function updateAnomalyView() {
            const sigma = parseFloat(nSigmaSlider.value);
            nSigmaSpan.textContent = `${sigma.toFixed(1)} σ`;

            const hampel = SensorAlgorithms.hampelFilter(rawTemp, 11, sigma);
            const zscore = SensorAlgorithms.rollingZScore(rawTemp, 25, sigma);

            // 이상치 포인트 마커 데이터셋 생성
            const hampelAnomPoints = new Array(n).fill(null);
            hampel.anomalies.forEach(a => {
                hampelAnomPoints[a.index] = a.original;
            });

            const tc = getThemeColors();
            const datasets = [
                {
                    label: '온도 원시값',
                    data: rawTemp,
                    borderColor: 'rgba(148, 163, 184, 0.4)',
                    borderWidth: 1.2,
                    pointRadius: 0
                },
                {
                    label: 'Hampel 필터 복원값 (Cleaned)',
                    data: hampel.cleaned,
                    borderColor: '#10b981',
                    borderWidth: 2,
                    pointRadius: 0
                },
                {
                    label: `탐지된 이상치 (${hampel.anomalies.length}개)`,
                    data: hampelAnomPoints,
                    borderColor: '#f43f5e',
                    backgroundColor: '#f43f5e',
                    pointRadius: 6,
                    pointHoverRadius: 8,
                    showLine: false
                }
            ];

            if (!anomalyChart) {
                const ctx = document.getElementById('anomalyChartCanvas').getContext('2d');
                anomalyChart = new Chart(ctx, {
                    type: 'line',
                    data: { labels, datasets },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            x: { grid: { color: tc.gridColor }, ticks: { color: tc.textColor, maxTicksLimit: 24 } },
                            y: { title: { display: true, text: '온도 (°C)', color: tc.textColor }, grid: { color: tc.gridColor }, ticks: { color: tc.textColor } }
                        },
                        plugins: {
                            legend: { position: 'top', labels: { color: tc.textColor } },
                            tooltip: { backgroundColor: tc.tooltipBg, titleColor: tc.tooltipText, bodyColor: tc.tooltipText }
                        }
                    }
                });
                charts['anomaly'] = anomalyChart;
            } else {
                anomalyChart.data.datasets = datasets;
                anomalyChart.update();
            }

            // 이상치 목록 테이블 렌더링
            const tbody = document.getElementById('anomalyTableBody');
            tbody.innerHTML = '';
            hampel.anomalies.forEach(a => {
                const row = document.createElement('tr');
                const timeStr = labels[a.index];
                const evLabel = events[a.index];
                const diff = (a.original - a.replacement).toFixed(2);
                row.innerHTML = `
                    <td><strong>${timeStr}</strong> (${a.index}분)</td>
                    <td style="color:#f43f5e; font-weight:700;">${a.original.toFixed(2)} °C</td>
                    <td style="color:#10b981;">${a.replacement.toFixed(2)} °C</td>
                    <td>${diff > 0 ? '+' + diff : diff} °C</td>
                    <td><span class="ev-tag ${evLabel === '스파이크 이상치' ? 'ev-spike' : 'ev-overheat'}">${evLabel}</span></td>
                `;
                tbody.appendChild(row);
            });
        }

        nSigmaSlider.addEventListener('input', updateAnomalyView);
        updateAnomalyView();
    }

    // 7. [탭 3] 다변량 상관 & 상태 공간 차트
    let multiNormChart = null;
    let stateSpaceChart = null;

    function initMultivariateTab() {
        const normTemp = SensorAlgorithms.minMaxScale(trueTemp);
        const normVib = SensorAlgorithms.minMaxScale(vibRms);
        const normPress = SensorAlgorithms.minMaxScale(pressure);

        const tc = getThemeColors();

        // 1) 다변량 동기화 차트
        const ctxNorm = document.getElementById('multivariateChartCanvas').getContext('2d');
        multiNormChart = new Chart(ctxNorm, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    { label: '정규화 온도 참값', data: normTemp, borderColor: '#f59e0b', borderWidth: 2, pointRadius: 0 },
                    { label: '정규화 진동 RMS', data: normVib, borderColor: '#8b5cf6', borderWidth: 1.8, pointRadius: 0 },
                    { label: '정규화 배관 압력', data: normPress, borderColor: '#06b6d4', borderWidth: 1.8, pointRadius: 0 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { grid: { color: tc.gridColor }, ticks: { color: tc.textColor, maxTicksLimit: 24 } },
                    y: { title: { display: true, text: '정규화 스케일 (0 ~ 1)', color: tc.textColor }, min: 0, max: 1, grid: { color: tc.gridColor }, ticks: { color: tc.textColor } }
                },
                plugins: { legend: { position: 'top', labels: { color: tc.textColor } } }
            }
        });
        charts['multiNorm'] = multiNormChart;

        // 2) 피어슨 상관 매트릭스 표 렌더링
        const corrMatrix = {
            '온도 원시값': {
                '온도 참값': SensorAlgorithms.pearsonCorr(rawTemp, trueTemp),
                '진동 RMS': SensorAlgorithms.pearsonCorr(rawTemp, vibRms),
                '배관 압력': SensorAlgorithms.pearsonCorr(rawTemp, pressure)
            },
            '온도 참값': {
                '진동 RMS': SensorAlgorithms.pearsonCorr(trueTemp, vibRms),
                '배관 압력': SensorAlgorithms.pearsonCorr(trueTemp, pressure)
            },
            '진동 RMS': {
                '배관 압력': SensorAlgorithms.pearsonCorr(vibRms, pressure)
            }
        };

        const corrTableBody = document.getElementById('corrTableBody');
        corrTableBody.innerHTML = `
            <tr><td><strong>온도 참값 ↔ 진동 RMS</strong></td><td><strong style="color:#f59e0b;">+${corrMatrix['온도 참값']['진동 RMS'].toFixed(3)}</strong></td><td>강한 양의 상관관계 (부하 증가 시 마찰열 및 발열 동반)</td></tr>
            <tr><td><strong>온도 참값 ↔ 배관 압력</strong></td><td><strong style="color:#06b6d4;">+${corrMatrix['온도 참값']['배관 압력'].toFixed(3)}</strong></td><td>중등도 양의 상관관계 (열팽창 및 유체 압력 동반 상승)</td></tr>
            <tr><td><strong>진동 RMS ↔ 배관 압력</strong></td><td><strong style="color:#8b5cf6;">+${corrMatrix['진동 RMS']['배관 압력'].toFixed(3)}</strong></td><td>양의 상관관계 (펌프 모터 부하 및 유체 맥동 발생)</td></tr>
            <tr><td><strong>온도 원시값 ↔ 온도 참값</strong></td><td><strong style="color:#10b981;">+${corrMatrix['온도 원시값']['온도 참값'].toFixed(3)}</strong></td><td>노이즈와 이상치 포함에도 물리적 기저 신호 보존됨</td></tr>
        `;

        // 3) 2D 상태 공간 궤적 (진동 vs 온도 산점도)
        const eventColors = {
            '정상': 'rgba(16, 185, 129, 0.45)',
            '스파이크 이상치': 'rgba(244, 63, 94, 0.9)',
            '단기 과열': 'rgba(245, 158, 11, 0.8)',
            '부하 증가': 'rgba(139, 92, 246, 0.8)',
            '급격한 과열': 'rgba(239, 68, 68, 0.95)',
            '장시간 부하': 'rgba(99, 102, 241, 0.8)',
            '일시 냉각': 'rgba(6, 182, 212, 0.8)'
        };

        const scatterGroups = {};
        for (let i = 0; i < n; i++) {
            const ev = events[i];
            if (!scatterGroups[ev]) scatterGroups[ev] = [];
            scatterGroups[ev].push({ x: vibRms[i], y: rawTemp[i] });
        }

        const scatterDatasets = Object.keys(scatterGroups).map(ev => ({
            label: ev,
            data: scatterGroups[ev],
            backgroundColor: eventColors[ev] || '#94a3b8',
            pointRadius: ev === '정상' ? 3 : 5,
            pointHoverRadius: 7
        }));

        const ctxState = document.getElementById('stateSpaceChartCanvas').getContext('2d');
        stateSpaceChart = new Chart(ctxState, {
            type: 'scatter',
            data: { datasets: scatterDatasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { title: { display: true, text: '진동 RMS (mm/s)', color: tc.textColor }, grid: { color: tc.gridColor }, ticks: { color: tc.textColor } },
                    y: { title: { display: true, text: '온도 (°C)', color: tc.textColor }, grid: { color: tc.gridColor }, ticks: { color: tc.textColor } }
                },
                plugins: {
                    legend: { position: 'top', labels: { color: tc.textColor, boxWidth: 12 } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: 진동 ${ctx.parsed.x.toFixed(2)} mm/s, 온도 ${ctx.parsed.y.toFixed(2)} °C`
                        }
                    }
                }
            }
        });
        charts['stateSpace'] = stateSpaceChart;
    }

    // 8. [탭 4] 주파수 스펙트럼 (FFT) & 이동 변동성 차트
    let fftChart = null;
    let volChart = null;

    function initFrequencyTab() {
        const fftRes = SensorAlgorithms.fftSpectrum(rawTemp);
        const volRes = SensorAlgorithms.rollingVolatility(rawTemp, 20);
        const tc = getThemeColors();

        // 1) FFT 스펙트럼 차트 (상위 120개 주파수만 표시하여 가독성 향상)
        const displayLimit = 120;
        const freqs = fftRes.freqs.slice(0, displayLimit).map(f => (f * 60).toFixed(2)); // cycles per hour
        const power = fftRes.power.slice(0, displayLimit);

        const ctxFft = document.getElementById('fftChartCanvas').getContext('2d');
        fftChart = new Chart(ctxFft, {
            type: 'bar',
            data: {
                labels: freqs,
                datasets: [{
                    label: '파워 스펙트럼 밀도 (PSD)',
                    data: power,
                    backgroundColor: 'rgba(59, 130, 246, 0.7)',
                    borderColor: '#3b82f6',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { title: { display: true, text: '주파수 (Cycles / Hour)', color: tc.textColor }, grid: { color: tc.gridColor }, ticks: { color: tc.textColor, maxTicksLimit: 20 } },
                    y: { title: { display: true, text: '파워 밀도', color: tc.textColor }, grid: { color: tc.gridColor }, ticks: { color: tc.textColor } }
                },
                plugins: { legend: { position: 'top', labels: { color: tc.textColor } } }
            }
        });
        charts['fft'] = fftChart;

        // 2) 롤링 변동성 지수 차트
        const ctxVol = document.getElementById('volatilityChartCanvas').getContext('2d');
        volChart = new Chart(ctxVol, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: '20분 롤링 변동성 (표준편차 σ)',
                    data: volRes,
                    borderColor: '#ec4899',
                    backgroundColor: 'rgba(236, 72, 153, 0.1)',
                    fill: true,
                    borderWidth: 1.8,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { color: tc.gridColor }, ticks: { color: tc.textColor, maxTicksLimit: 24 } },
                    y: { title: { display: true, text: '국소 표준편차 (°C)', color: tc.textColor }, grid: { color: tc.gridColor }, ticks: { color: tc.textColor } }
                },
                plugins: { legend: { position: 'top', labels: { color: tc.textColor } } }
            }
        });
        charts['volatility'] = volChart;
    }

    // 9. [탭 5] 변화점(CUSUM/미분) 및 이벤트 통계 프로파일링
    let diffChart = null;
    let eventBarChart = null;

    function initEventChangeTab() {
        const diff = SensorAlgorithms.differential(trueTemp);
        const cusumRes = SensorAlgorithms.cusum(rawTemp, 0.5, 4.0);
        const tc = getThemeColors();

        // 1) 1차 미분 및 CUSUM 변화점
        const ctxDiff = document.getElementById('changePointChartCanvas').getContext('2d');
        diffChart = new Chart(ctxDiff, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: '온도 변화율 (dT/dt °C/min)',
                        data: diff.d1,
                        borderColor: '#06b6d4',
                        borderWidth: 1.5,
                        pointRadius: 0,
                        yAxisID: 'y1'
                    },
                    {
                        label: 'CUSUM 상승 누적합 (S+)',
                        data: cusumRes.sPos,
                        borderColor: '#f59e0b',
                        borderWidth: 1.5,
                        pointRadius: 0,
                        yAxisID: 'y2'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { color: tc.gridColor }, ticks: { color: tc.textColor, maxTicksLimit: 24 } },
                    y1: { type: 'linear', position: 'left', title: { display: true, text: 'dT/dt (°C/분)', color: tc.textColor }, grid: { color: tc.gridColor }, ticks: { color: tc.textColor } },
                    y2: { type: 'linear', position: 'right', title: { display: true, text: 'CUSUM 점수', color: tc.textColor }, grid: { drawOnChartArea: false }, ticks: { color: tc.textColor } }
                },
                plugins: { legend: { position: 'top', labels: { color: tc.textColor } } }
            }
        });
        charts['diff'] = diffChart;

        // 2) 7대 이벤트별 센서 평균값 바 차트
        const profile = SensorAlgorithms.eventProfiling(rawTemp, events);
        const evNames = Object.keys(profile);
        const avgTemps = evNames.map(ev => profile[ev].mean);
        const counts = evNames.map(ev => profile[ev].count);

        const ctxEv = document.getElementById('eventProfileChartCanvas').getContext('2d');
        eventBarChart = new Chart(ctxEv, {
            type: 'bar',
            data: {
                labels: evNames,
                datasets: [
                    {
                        label: '평균 온도 (°C)',
                        data: avgTemps,
                        backgroundColor: 'rgba(245, 158, 11, 0.75)',
                        borderColor: '#f59e0b',
                        borderWidth: 1,
                        yAxisID: 'yTemp'
                    },
                    {
                        label: '지속 시간 (분)',
                        data: counts,
                        backgroundColor: 'rgba(59, 130, 246, 0.65)',
                        borderColor: '#3b82f6',
                        borderWidth: 1,
                        yAxisID: 'yCount'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { color: tc.gridColor }, ticks: { color: tc.textColor } },
                    yTemp: { type: 'linear', position: 'left', title: { display: true, text: '평균 온도 (°C)', color: tc.textColor }, grid: { color: tc.gridColor }, ticks: { color: tc.textColor } },
                    yCount: { type: 'linear', position: 'right', title: { display: true, text: '샘플 수 (분)', color: tc.textColor }, grid: { drawOnChartArea: false }, ticks: { color: tc.textColor } }
                },
                plugins: { legend: { position: 'top', labels: { color: tc.textColor } } }
            }
        });
        charts['eventBar'] = eventBarChart;
    }

    // 10. [탭 6] 건전성 지수(HI) & 다중 회귀 잔차 분석
    let residualChart = null;
    let healthChart = null;

    function initHealthResidualTab() {
        const reg = SensorAlgorithms.regressionResiduals(rawTemp, vibRms, pressure);
        const hi = SensorAlgorithms.compositeHealthIndex(rawTemp, vibRms, pressure, trueTemp);
        const tc = getThemeColors();

        // 1) 회귀 잔차 차트
        const ctxRes = document.getElementById('residualChartCanvas').getContext('2d');
        residualChart = new Chart(ctxRes, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: '온도 원시값',
                        data: rawTemp,
                        borderColor: 'rgba(148, 163, 184, 0.5)',
                        borderWidth: 1.2,
                        pointRadius: 0
                    },
                    {
                        label: '다중회귀 모델 추정치 (Vib + Press)',
                        data: reg.predicted,
                        borderColor: '#3b82f6',
                        borderWidth: 1.8,
                        pointRadius: 0
                    },
                    {
                        label: '잔차 (Residuals)',
                        data: reg.residuals,
                        borderColor: '#ec4899',
                        borderWidth: 1,
                        pointRadius: 0,
                        backgroundColor: 'rgba(236, 72, 153, 0.1)',
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { color: tc.gridColor }, ticks: { color: tc.textColor, maxTicksLimit: 24 } },
                    y: { title: { display: true, text: '온도 / 잔차 (°C)', color: tc.textColor }, grid: { color: tc.gridColor }, ticks: { color: tc.textColor } }
                },
                plugins: { legend: { position: 'top', labels: { color: tc.textColor } } }
            }
        });
        charts['residual'] = residualChart;

        // 2) 복합 장비 건전성 지수 (Health Index: 0~100)
        const ctxHi = document.getElementById('healthChartCanvas').getContext('2d');
        healthChart = new Chart(ctxHi, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: '종합 장비 건전성 지수 (HI)',
                        data: hi.healthIndex,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.15)',
                        fill: true,
                        borderWidth: 2,
                        pointRadius: 0,
                        segment: {
                            borderColor: ctx => {
                                const val = ctx.p0.parsed.y;
                                if (val < 40) return '#f43f5e'; // 위험
                                if (val < 70) return '#f59e0b'; // 주의
                                return '#10b981'; // 양호
                            }
                        }
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { grid: { color: tc.gridColor }, ticks: { color: tc.textColor, maxTicksLimit: 24 } },
                    y: { min: 0, max: 100, title: { display: true, text: '건전성 점수 (0-100)', color: tc.textColor }, grid: { color: tc.gridColor }, ticks: { color: tc.textColor } }
                },
                plugins: {
                    legend: { position: 'top', labels: { color: tc.textColor } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const v = ctx.parsed.y;
                                const status = v >= 70 ? '🟢 정상' : v >= 40 ? '🟡 주의' : '🔴 위험';
                                return `건전성 지수: ${v.toFixed(1)}점 [${status}]`;
                            }
                        }
                    }
                }
            }
        });
        charts['health'] = healthChart;
    }

    // 초기화 실행
    initKPIs();
    initSmoothingTab();
    initAnomalyTab();
    initMultivariateTab();
    initFrequencyTab();
    initEventChangeTab();
    initHealthResidualTab();
});
