/**
 * algorithms.js
 * 산업용 센서 시계열 데이터 분석을 위한 20가지 수학/통계/신호처리 알고리즘 엔진
 * 순수 Vanilla JS로 작성되어 브라우저 로컬에서 초고속으로 연산됨.
 */

const SensorAlgorithms = (function() {
    'use strict';

    // 기본 통계 도구
    function mean(arr) {
        if (!arr || arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
    }

    function stdDev(arr, m) {
        if (!arr || arr.length <= 1) return 0;
        const avg = m !== undefined ? m : mean(arr);
        const sumSq = arr.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0);
        return Math.sqrt(sumSq / (arr.length - 1));
    }

    function median(arr) {
        if (!arr || arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    // 1. 단순 이동평균 (Simple Moving Average - SMA)
    function sma(data, windowSize) {
        const result = new Array(data.length);
        const half = Math.floor(windowSize / 2);
        for (let i = 0; i < data.length; i++) {
            const start = Math.max(0, i - half);
            const end = Math.min(data.length, i + half + 1);
            let sum = 0;
            for (let j = start; j < end; j++) sum += data[j];
            result[i] = sum / (end - start);
        }
        return result;
    }

    // 2. 지수 이동평균 (Exponential Moving Average - EMA)
    function ema(data, span) {
        const result = new Array(data.length);
        const alpha = 2 / (span + 1);
        result[0] = data[0];
        for (let i = 1; i < data.length; i++) {
            result[i] = alpha * data[i] + (1 - alpha) * result[i - 1];
        }
        return result;
    }

    // 3. 사비츠키-골레이 필터 (Savitzky-Golay Filter, 2차 다항식)
    function savitzkyGolay(data, windowSize = 15) {
        // 윈도우 크기는 홀수여야 함
        const m = Math.max(5, windowSize % 2 === 0 ? windowSize + 1 : windowSize);
        const half = Math.floor(m / 2);
        const result = new Array(data.length);

        // 2차 다항식 국소 최소자승 계수 사전 계산
        const weights = [];
        let denom = 0;
        for (let i = -half; i <= half; i++) {
            denom += Math.pow(i, 2);
        }
        // 표준 SG 가중치 공식 (다항식 차수 2)
        const J = half;
        const d_sum = (2 * J - 1) * (2 * J + 1) * (2 * J + 3);
        for (let i = -half; i <= half; i++) {
            const w = (3 * (3 * J * J + 3 * J - 1 - 5 * i * i)) / ( (4 * J * J * J * 3 - 3 * J) / 3 || 1 );
            weights.push(w);
        }
        const wSum = weights.reduce((a, b) => a + b, 0);
        const normWeights = weights.map(w => w / wSum);

        for (let i = 0; i < data.length; i++) {
            let sum = 0;
            let currentWeightsSum = 0;
            for (let j = -half; j <= half; j++) {
                const idx = i + j;
                if (idx >= 0 && idx < data.length) {
                    const w = normWeights[j + half];
                    sum += data[idx] * w;
                    currentWeightsSum += w;
                }
            }
            result[i] = sum / (currentWeightsSum || 1);
        }
        return result;
    }

    // 4. 가우시안 스무딩 필터 (Gaussian Smoothing Filter)
    function gaussianFilter(data, sigma = 3) {
        const radius = Math.ceil(sigma * 3);
        const kernel = [];
        let kSum = 0;
        for (let i = -radius; i <= radius; i++) {
            const g = Math.exp(-(i * i) / (2 * sigma * sigma));
            kernel.push(g);
            kSum += g;
        }
        const normKernel = kernel.map(k => k / kSum);

        const result = new Array(data.length);
        for (let i = 0; i < data.length; i++) {
            let sum = 0;
            let currentSum = 0;
            for (let j = -radius; j <= radius; j++) {
                const idx = i + j;
                if (idx >= 0 && idx < data.length) {
                    const w = normKernel[j + radius];
                    sum += data[idx] * w;
                    currentSum += w;
                }
            }
            result[i] = sum / (currentSum || 1);
        }
        return result;
    }

    // 5. 국소 피크 포락선 (Peak Envelopes - Upper & Lower)
    function peakEnvelopes(data, windowSize = 25) {
        const half = Math.floor(windowSize / 2);
        const upper = new Array(data.length);
        const lower = new Array(data.length);

        for (let i = 0; i < data.length; i++) {
            const start = Math.max(0, i - half);
            const end = Math.min(data.length, i + half + 1);
            let maxVal = -Infinity;
            let minVal = Infinity;
            for (let j = start; j < end; j++) {
                if (data[j] > maxVal) maxVal = data[j];
                if (data[j] < minVal) minVal = data[j];
            }
            upper[i] = maxVal;
            lower[i] = minVal;
        }
        return { upper, lower };
    }

    // 6. 햄펠 필터 (Hampel Filter - 스파이크 이상치 감지 및 보정)
    function hampelFilter(data, windowSize = 9, nSigma = 3) {
        const half = Math.floor(windowSize / 2);
        const cleaned = [...data];
        const anomalies = []; // { index, original, replacement }

        for (let i = 0; i < data.length; i++) {
            const start = Math.max(0, i - half);
            const end = Math.min(data.length, i + half + 1);
            const win = data.slice(start, end);
            const winMed = median(win);
            const diffs = win.map(x => Math.abs(x - winMed));
            const mad = median(diffs);
            const threshold = 1.4826 * nSigma * mad;

            if (Math.abs(data[i] - winMed) > threshold && threshold > 0.001) {
                anomalies.push({ index: i, original: data[i], replacement: winMed });
                cleaned[i] = winMed;
            }
        }
        return { cleaned, anomalies };
    }

    // 7. 롤링 Z-Score 이상치 탐지 (Rolling Z-Score Anomaly Detection)
    function rollingZScore(data, windowSize = 30, threshold = 3.0) {
        const half = Math.floor(windowSize / 2);
        const zScores = new Array(data.length);
        const anomalies = [];

        for (let i = 0; i < data.length; i++) {
            const start = Math.max(0, i - half);
            const end = Math.min(data.length, i + half + 1);
            const win = data.slice(start, end);
            const m = mean(win);
            const s = stdDev(win, m);
            const z = s > 0 ? (data[i] - m) / s : 0;
            zScores[i] = z;
            if (Math.abs(z) >= threshold) {
                anomalies.push({ index: i, value: data[i], zScore: z });
            }
        }
        return { zScores, anomalies };
    }

    // 8. 중앙값 필터 (Median Filter - 단발성 임펄스 노이즈 완벽 제거)
    function medianFilter(data, windowSize = 7) {
        const half = Math.floor(windowSize / 2);
        const result = new Array(data.length);
        for (let i = 0; i < data.length; i++) {
            const start = Math.max(0, i - half);
            const end = Math.min(data.length, i + half + 1);
            result[i] = median(data.slice(start, end));
        }
        return result;
    }

    // 9. Min-Max 정규화 & Z-Score 표준화 (Multivariate Standardization)
    function minMaxScale(data) {
        const minVal = Math.min(...data);
        const maxVal = Math.max(...data);
        const range = maxVal - minVal || 1;
        return data.map(x => (x - minVal) / range);
    }

    function zScoreScale(data) {
        const m = mean(data);
        const s = stdDev(data, m) || 1;
        return data.map(x => (x - m) / s);
    }

    // 10. 피어슨 상관계수 및 교차상관 (Cross-Correlation)
    function pearsonCorr(x, y) {
        const n = Math.min(x.length, y.length);
        const mx = mean(x.slice(0, n));
        const my = mean(y.slice(0, n));
        let num = 0, denX = 0, denY = 0;
        for (let i = 0; i < n; i++) {
            const dx = x[i] - mx;
            const dy = y[i] - my;
            num += dx * dy;
            denX += dx * dx;
            denY += dy * dy;
        }
        return num / (Math.sqrt(denX * denY) || 1);
    }

    function crossCorrelation(x, y, maxLag = 30) {
        const results = [];
        for (let lag = -maxLag; lag <= maxLag; lag++) {
            let xSub, ySub;
            if (lag >= 0) {
                xSub = x.slice(0, x.length - lag);
                ySub = y.slice(lag);
            } else {
                xSub = x.slice(-lag);
                ySub = y.slice(0, y.length + lag);
            }
            results.push({ lag, corr: pearsonCorr(xSub, ySub) });
        }
        return results;
    }

    // 11. 상태 공간 궤적 및 2D 군집 중심 분석 (State Space 2D Trajectory)
    function stateSpaceTrajectory(x, y, events) {
        const clusters = {};
        for (let i = 0; i < x.length; i++) {
            const ev = events[i] || '정상';
            if (!clusters[ev]) clusters[ev] = { points: [], sumX: 0, sumY: 0 };
            clusters[ev].points.push({ x: x[i], y: y[i], index: i });
            clusters[ev].sumX += x[i];
            clusters[ev].sumY += y[i];
        }
        const centroids = {};
        for (const ev in clusters) {
            const n = clusters[ev].points.length;
            centroids[ev] = {
                x: clusters[ev].sumX / n,
                y: clusters[ev].sumY / n,
                count: n
            };
        }
        return { clusters, centroids };
    }

    // 12. 고속 푸리에 변환 (FFT Spectrum / Power Spectral Density)
    function fftSpectrum(data) {
        // 2의 거듭제곱으로 제로 패딩 (1440 -> 2048)
        let n = 1;
        while (n < data.length) n <<= 1;
        const real = new Float64Array(n);
        const imag = new Float64Array(n);

        const m = mean(data);
        for (let i = 0; i < data.length; i++) real[i] = data[i] - m; // DC 성분 제거

        // 비트 반전 정렬
        let j = 0;
        for (let i = 0; i < n - 1; i++) {
            if (i < j) {
                const tr = real[i]; real[i] = real[j]; real[j] = tr;
                const ti = imag[i]; imag[i] = imag[j]; imag[j] = ti;
            }
            let k = n >> 1;
            while (k <= j) {
                j -= k;
                k >>= 1;
            }
            j += k;
        }

        // Cooley-Tukey FFT
        for (let len = 2; len <= n; len <<= 1) {
            const angle = -2 * Math.PI / len;
            const wlen_r = Math.cos(angle);
            const wlen_i = Math.sin(angle);
            for (let i = 0; i < n; i += len) {
                let w_r = 1.0, w_i = 0.0;
                for (let k = 0; k < len / 2; k++) {
                    const u_r = real[i + k];
                    const u_i = imag[i + k];
                    const v_r = real[i + k + len / 2] * w_r - imag[i + k + len / 2] * w_i;
                    const v_i = real[i + k + len / 2] * w_i + imag[i + k + len / 2] * w_r;
                    real[i + k] = u_r + v_r;
                    imag[i + k] = u_i + v_i;
                    real[i + k + len / 2] = u_r - v_r;
                    imag[i + k + len / 2] = u_i - v_i;
                    const next_w_r = w_r * wlen_r - w_i * wlen_i;
                    w_i = w_r * wlen_i + w_i * wlen_r;
                    w_r = next_w_r;
                }
            }
        }

        // 파워 스펙트럼 (샘플링 주기: 1분 = 1/60 Hz, 나이퀴스트 = 0.5 cycle/min)
        const halfN = n / 2;
        const freqs = [];
        const power = [];
        for (let i = 1; i < halfN; i++) {
            const freq = i / n; // cycles per minute
            const p = (real[i] * real[i] + imag[i] * imag[i]) / n;
            freqs.push(freq);
            power.push(p);
        }
        return { freqs, power };
    }

    // 13. 이동 변동성/표준편차 (Rolling Volatility / Stability Index)
    function rollingVolatility(data, windowSize = 20) {
        const half = Math.floor(windowSize / 2);
        const result = new Array(data.length);
        for (let i = 0; i < data.length; i++) {
            const start = Math.max(0, i - half);
            const end = Math.min(data.length, i + half + 1);
            result[i] = stdDev(data.slice(start, end));
        }
        return result;
    }

    // 14. 1차/2차 미분 및 변화율 (First/Second Order Differential)
    function differential(data) {
        const d1 = new Array(data.length);
        const d2 = new Array(data.length);
        d1[0] = data[1] - data[0];
        d1[data.length - 1] = data[data.length - 1] - data[data.length - 2];
        for (let i = 1; i < data.length - 1; i++) {
            d1[i] = (data[i + 1] - data[i - 1]) / 2;
        }
        d2[0] = d1[1] - d1[0];
        d2[data.length - 1] = d1[data.length - 1] - d1[data.length - 2];
        for (let i = 1; i < data.length - 1; i++) {
            d2[i] = data[i + 1] - 2 * data[i] + data[i - 1];
        }
        return { d1, d2 };
    }

    // 15. CUSUM 누적합 변화점 탐지 (Cumulative Sum Control Chart)
    function cusum(data, k = 0.5, h = 5.0) {
        const m = mean(data);
        const s = stdDev(data, m) || 1;
        const z = data.map(x => (x - m) / s);
        const sPos = new Array(data.length);
        const sNeg = new Array(data.length);
        const alarms = [];

        sPos[0] = Math.max(0, z[0] - k);
        sNeg[0] = Math.max(0, -k - z[0]);

        for (let i = 1; i < data.length; i++) {
            sPos[i] = Math.max(0, sPos[i - 1] + z[i] - k);
            sNeg[i] = Math.max(0, sNeg[i - 1] - z[i] - k);
            if (sPos[i] > h || sNeg[i] > h) {
                alarms.push({ index: i, type: sPos[i] > h ? '상승 변화점' : '하강 변화점', sPos: sPos[i], sNeg: sNeg[i] });
            }
        }
        return { sPos, sNeg, alarms };
    }

    // 16. 이벤트 구간 분할 및 통계 프로파일링 (Event Regime Profiling)
    function eventProfiling(data, events) {
        const groups = {};
        for (let i = 0; i < data.length; i++) {
            const ev = events[i] || '정상';
            if (!groups[ev]) groups[ev] = [];
            groups[ev].push(data[i]);
        }
        const profile = {};
        for (const ev in groups) {
            const vals = groups[ev];
            const m = mean(vals);
            const s = stdDev(vals, m);
            profile[ev] = {
                count: vals.length,
                percentage: (vals.length / data.length * 100).toFixed(2),
                mean: m,
                std: s,
                min: Math.min(...vals),
                max: Math.max(...vals),
                median: median(vals)
            };
        }
        return profile;
    }

    // 17. 정량 벤치마크 평가 (RMSE, MAE, R², SNR 개선도, MAPE)
    function evaluateMetrics(smoothed, groundTruth, raw) {
        const n = groundTruth.length;
        let sumSqErr = 0, sumAbsErr = 0, sumPctErr = 0;
        let ssTot = 0, ssRes = 0;
        const meanGT = mean(groundTruth);

        for (let i = 0; i < n; i++) {
            const err = smoothed[i] - groundTruth[i];
            sumSqErr += err * err;
            sumAbsErr += Math.abs(err);
            if (groundTruth[i] !== 0) {
                sumPctErr += Math.abs(err / groundTruth[i]);
            }
            ssRes += err * err;
            ssTot += Math.pow(groundTruth[i] - meanGT, 2);
        }

        const rmse = Math.sqrt(sumSqErr / n);
        const mae = sumAbsErr / n;
        const mape = (sumPctErr / n) * 100;
        const r2 = 1 - (ssRes / (ssTot || 1));

        // SNR (신호 대 잡음비 개선도)
        let rawNoiseSq = 0;
        for (let i = 0; i < n; i++) {
            rawNoiseSq += Math.pow(raw[i] - groundTruth[i], 2);
        }
        const snrGainDb = 10 * Math.log10((rawNoiseSq || 1) / (sumSqErr || 1));

        return { rmse, mae, mape, r2, snrGainDb };
    }

    // 18. 위상 지연(Phase Lag) 및 피크 왜곡도 분석
    function analyzePhaseLag(smoothed, groundTruth, maxLag = 15) {
        let bestLag = 0;
        let bestCorr = -1;
        for (let lag = 0; lag <= maxLag; lag++) {
            const sSub = smoothed.slice(lag);
            const gSub = groundTruth.slice(0, groundTruth.length - lag);
            const c = pearsonCorr(sSub, gSub);
            if (c > bestCorr) {
                bestCorr = c;
                bestLag = lag;
            }
        }
        // 피크 진폭 보존율 (참값 최대 진폭 대비 스무딩 최대 진폭 비율)
        const gtAmp = Math.max(...groundTruth) - Math.min(...groundTruth);
        const smAmp = Math.max(...smoothed) - Math.min(...smoothed);
        const ampPreservation = (smAmp / (gtAmp || 1)) * 100;

        return { lagMinutes: bestLag, maxCorrelation: bestCorr, ampPreservation };
    }

    // 19. 다변량 다중 선형회귀 잔차 분석 (Regression Residual Analysis)
    function regressionResiduals(temp, vib, press) {
        // Temp = beta0 + beta1 * Vib + beta2 * Press
        // OLS Normal Equation (3x3 행렬 해석)
        const n = temp.length;
        let sumV = 0, sumP = 0, sumT = 0;
        let sumVV = 0, sumPP = 0, sumVP = 0;
        let sumVT = 0, sumPT = 0;

        for (let i = 0; i < n; i++) {
            const v = vib[i], p = press[i], t = temp[i];
            sumV += v; sumP += p; sumT += t;
            sumVV += v * v; sumPP += p * p; sumVP += v * p;
            sumVT += v * t; sumPT += p * t;
        }

        // 간이 2변수 회귀 계수 도출
        const meanV = sumV / n, meanP = sumP / n, meanT = sumT / n;
        let covVT = 0, covPT = 0, varV = 0, varP = 0, covVP = 0;
        for (let i = 0; i < n; i++) {
            const dv = vib[i] - meanV;
            const dp = press[i] - meanP;
            const dt = temp[i] - meanT;
            covVT += dv * dt;
            covPT += dp * dt;
            varV += dv * dv;
            varP += dp * dp;
            covVP += dv * dp;
        }
        const det = varV * varP - covVP * covVP;
        const b1 = (covVT * varP - covPT * covVP) / (det || 1);
        const b2 = (covPT * varV - covVT * covVP) / (det || 1);
        const b0 = meanT - b1 * meanV - b2 * meanP;

        const predicted = new Array(n);
        const residuals = new Array(n);
        for (let i = 0; i < n; i++) {
            predicted[i] = b0 + b1 * vib[i] + b2 * press[i];
            residuals[i] = temp[i] - predicted[i];
        }

        return { b0, b1, b2, predicted, residuals };
    }

    // 20. 복합 장비 건전성 지수 (Composite Health Index: 0~100)
    function compositeHealthIndex(temp, vib, press, groundTruth) {
        const n = temp.length;
        // 기준 정상값 및 허용 표준편차
        const baselineTemp = 20.0;
        const baselineVib = 1.0;
        const baselinePress = 101.3;

        const healthIndex = new Array(n);
        const anomalyScores = new Array(n);

        for (let i = 0; i < n; i++) {
            // Z-score 기반 다변량 이상 점수
            const zTemp = Math.max(0, (temp[i] - baselineTemp) / 3.5);
            const zVib = Math.max(0, (vib[i] - baselineVib) / 0.4);
            const zPress = Math.abs(press[i] - baselinePress) / 1.0;

            const score = (zTemp * 0.45) + (zVib * 0.40) + (zPress * 0.15);
            anomalyScores[i] = score;

            // 건강 지수 (100점 만점에서 이상 점수에 따라 감점)
            const hi = Math.max(0, Math.min(100, 100 - score * 18));
            healthIndex[i] = hi;
        }
        return { healthIndex, anomalyScores };
    }

    return {
        sma,
        ema,
        savitzkyGolay,
        gaussianFilter,
        peakEnvelopes,
        hampelFilter,
        rollingZScore,
        medianFilter,
        minMaxScale,
        zScoreScale,
        pearsonCorr,
        crossCorrelation,
        stateSpaceTrajectory,
        fftSpectrum,
        rollingVolatility,
        differential,
        cusum,
        eventProfiling,
        evaluateMetrics,
        analyzePhaseLag,
        regressionResiduals,
        compositeHealthIndex,
        mean,
        stdDev,
        median
    };
})();
