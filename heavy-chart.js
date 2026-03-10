(function () {
    var PADDING_LEFT = 52;
    var PADDING_RIGHT = 20;
    var PADDING_TOP = 28;
    var PADDING_BOTTOM = 36;
    var CHART_HEIGHT = 332;

    var container = document.getElementById('chart-container');
    var movementSelect = document.getElementById('movement-select');
    var rangeBar = document.getElementById('range-bar');
    var tabBar = document.getElementById('chart-tab-bar');
    var legendEl = document.querySelector('.heavy-legend');
    var statsRow = document.getElementById('stats-row');

    var currentData = null;
    var currentRange = 'All';
    var currentMovement = null;
    var currentChart = 'weight';
    var visibleSeries = { max: true, avg: true, min: true };
    // For frequency chart: volume single line, pr single line
    var visibleVolume = { volume: true };
    var visiblePR = { pr: true };
    var visibleFreq = { freq: true };

    // --- Data functions ---

    function getRangeStartDate(range) {
        if (range === 'All') return null;
        var now = new Date();
        switch (range) {
            case '1M': now.setMonth(now.getMonth() - 1); break;
            case '3M': now.setMonth(now.getMonth() - 3); break;
            case '6M': now.setMonth(now.getMonth() - 6); break;
            case '1Y': now.setFullYear(now.getFullYear() - 1); break;
        }
        return now;
    }

    function aggregateChartData(data, movementName, range) {
        var rangeStart = getRangeStartDate(range);
        var dateMap = {};
        var normalizedName = movementName.trim().toLowerCase();
        var workouts = data.workouts || [];

        for (var w = 0; w < workouts.length; w++) {
            var workout = workouts[w];
            if (rangeStart) {
                var wd = new Date(workout.date + 'T12:00:00Z');
                if (wd < rangeStart) continue;
            }
            var movements = workout.movements || [];
            for (var m = 0; m < movements.length; m++) {
                var mov = movements[m];
                if (mov.name.trim().toLowerCase() !== normalizedName) continue;
                var sets = mov.sets || [];
                for (var s = 0; s < sets.length; s++) {
                    var weight = parseFloat(sets[s].weight);
                    if (isFinite(weight) && weight > 0) {
                        if (!dateMap[workout.date]) dateMap[workout.date] = [];
                        dateMap[workout.date].push(weight);
                    }
                }
            }
        }

        var points = [];
        var dates = Object.keys(dateMap).sort();
        for (var i = 0; i < dates.length; i++) {
            var weights = dateMap[dates[i]];
            var sum = 0;
            var min = Infinity;
            var max = -Infinity;
            for (var j = 0; j < weights.length; j++) {
                sum += weights[j];
                if (weights[j] < min) min = weights[j];
                if (weights[j] > max) max = weights[j];
            }
            points.push({
                date: dates[i],
                minWeight: min,
                avgWeight: sum / weights.length,
                maxWeight: max
            });
        }
        return points;
    }

    function aggregateVolumeData(data, movementName, range) {
        var rangeStart = getRangeStartDate(range);
        var dateMap = {};
        var normalizedName = movementName.trim().toLowerCase();
        var workouts = data.workouts || [];

        for (var w = 0; w < workouts.length; w++) {
            var workout = workouts[w];
            if (rangeStart) {
                var wd = new Date(workout.date + 'T12:00:00Z');
                if (wd < rangeStart) continue;
            }
            var movements = workout.movements || [];
            for (var m = 0; m < movements.length; m++) {
                var mov = movements[m];
                if (mov.name.trim().toLowerCase() !== normalizedName) continue;
                var sets = mov.sets || [];
                for (var s = 0; s < sets.length; s++) {
                    var weight = parseFloat(sets[s].weight);
                    var reps = parseInt(sets[s].reps, 10);
                    if (!isFinite(reps) || reps <= 0) reps = 1;
                    if (isFinite(weight) && weight > 0) {
                        if (!dateMap[workout.date]) dateMap[workout.date] = 0;
                        dateMap[workout.date] += weight * reps;
                    }
                }
            }
        }

        var points = [];
        var dates = Object.keys(dateMap).sort();
        for (var i = 0; i < dates.length; i++) {
            points.push({ date: dates[i], volume: dateMap[dates[i]] });
        }
        return points;
    }

    function aggregatePRData(data, movementName, range) {
        var rangeStart = getRangeStartDate(range);
        var normalizedName = movementName.trim().toLowerCase();
        var workouts = (data.workouts || []).slice().sort(function (a, b) {
            return a.date.localeCompare(b.date);
        });

        var runningMax = -Infinity;
        var points = [];
        for (var w = 0; w < workouts.length; w++) {
            var workout = workouts[w];
            var movements = workout.movements || [];
            var sessionMax = -Infinity;
            for (var m = 0; m < movements.length; m++) {
                var mov = movements[m];
                if (mov.name.trim().toLowerCase() !== normalizedName) continue;
                var sets = mov.sets || [];
                for (var s = 0; s < sets.length; s++) {
                    var weight = parseFloat(sets[s].weight);
                    if (isFinite(weight) && weight > sessionMax) sessionMax = weight;
                }
            }
            if (sessionMax > runningMax) {
                runningMax = sessionMax;
                // Only include if in range
                if (rangeStart) {
                    var wd = new Date(workout.date + 'T12:00:00Z');
                    if (wd < rangeStart) continue;
                }
                points.push({ date: workout.date, weight: runningMax });
            }
        }
        return points;
    }

    function aggregateFrequencyData(data, movementName, range) {
        var rangeStart = getRangeStartDate(range);
        var normalizedName = movementName ? movementName.trim().toLowerCase() : null;
        var isAll = movementName === '__all__';
        var workouts = data.workouts || [];
        var useBigBuckets = (range === 'All' || range === '1Y');

        var dateSet = {};
        for (var w = 0; w < workouts.length; w++) {
            var workout = workouts[w];
            if (rangeStart) {
                var wd = new Date(workout.date + 'T12:00:00Z');
                if (wd < rangeStart) continue;
            }
            if (isAll) {
                dateSet[workout.date] = true;
            } else {
                var movements = workout.movements || [];
                for (var m = 0; m < movements.length; m++) {
                    if (movements[m].name.trim().toLowerCase() === normalizedName) {
                        dateSet[workout.date] = true;
                        break;
                    }
                }
            }
        }

        var dates = Object.keys(dateSet).sort();
        if (dates.length === 0) return [];

        // Bucket into weeks or months
        var buckets = {};
        for (var i = 0; i < dates.length; i++) {
            var d = new Date(dates[i] + 'T12:00:00Z');
            var key;
            if (useBigBuckets) {
                key = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
            } else {
                // ISO week start (Monday)
                var day = d.getUTCDay();
                var diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
                var weekStart = new Date(d);
                weekStart.setUTCDate(diff);
                key = weekStart.toISOString().slice(0, 10);
            }
            if (!buckets[key]) buckets[key] = 0;
            buckets[key]++;
        }

        var keys = Object.keys(buckets).sort();
        var result = [];
        for (var i = 0; i < keys.length; i++) {
            result.push({ bucket: keys[i], count: buckets[keys[i]] });
        }
        return result;
    }

    function getAllMovementNames(data) {
        var lastUsed = {};
        var displayName = {};
        var workouts = (data.workouts || []).slice().sort(function (a, b) {
            return a.date.localeCompare(b.date);
        });

        for (var w = 0; w < workouts.length; w++) {
            var workout = workouts[w];
            var movements = workout.movements || [];
            for (var m = 0; m < movements.length; m++) {
                var trimmed = movements[m].name.trim();
                if (!trimmed) continue;
                var key = trimmed.toLowerCase();
                displayName[key] = trimmed;
                if (!lastUsed[key] || workout.date > lastUsed[key]) {
                    lastUsed[key] = workout.date;
                }
            }
        }

        var used = Object.keys(lastUsed).sort(function (a, b) {
            return lastUsed[b].localeCompare(lastUsed[a]);
        }).map(function (k) { return displayName[k]; });

        return used;
    }

    function findMostRecentMovement(data) {
        var workouts = (data.workouts || []).slice().sort(function (a, b) {
            return b.date.localeCompare(a.date);
        });
        for (var w = 0; w < workouts.length; w++) {
            var movements = workouts[w].movements || [];
            for (var m = movements.length - 1; m >= 0; m--) {
                if (movements[m].name.trim()) return movements[m].name.trim();
            }
        }
        return null;
    }

    function niceTickValues(min, max, targetCount) {
        if (min === max) {
            return [Math.max(0, min - 10), min, min + 10];
        }
        var range = max - min;
        var roughStep = range / (targetCount - 1);
        var magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
        var candidates = [1, 2, 2.5, 5, 10];
        var step = candidates[0] * magnitude;
        for (var i = 0; i < candidates.length; i++) {
            if (candidates[i] * magnitude >= roughStep) {
                step = candidates[i] * magnitude;
                break;
            }
        }
        var niceMin = Math.floor(min / step) * step;
        var niceMax = Math.ceil(max / step) * step;
        var ticks = [];
        for (var v = niceMin; v <= niceMax + step * 0.01; v += step) {
            ticks.push(Math.round(v * 100) / 100);
        }
        return ticks;
    }

    function niceIntegerTicks(min, max, targetCount) {
        if (min === max) return [Math.max(0, min - 1), min, min + 1];
        var range = max - min;
        var roughStep = range / (targetCount - 1);
        var step = Math.max(1, Math.ceil(roughStep));
        var niceMin = Math.floor(min / step) * step;
        var niceMax = Math.ceil(max / step) * step;
        var ticks = [];
        for (var v = niceMin; v <= niceMax; v += step) {
            ticks.push(v);
        }
        return ticks;
    }

    function formatDateLabel(dateStr) {
        var d = new Date(dateStr + 'T12:00:00Z');
        var month = d.toLocaleString('default', { month: 'short', timeZone: 'UTC' });
        var day = d.getUTCDate();
        return month + ' ' + day;
    }

    function formatBucketLabel(bucket, isBig) {
        if (isBig) {
            // "2024-03" -> "Mar '24"
            var parts = bucket.split('-');
            var d = new Date(Date.UTC(+parts[0], +parts[1] - 1, 1));
            var month = d.toLocaleString('default', { month: 'short', timeZone: 'UTC' });
            return month + " '" + String(parts[0]).slice(2);
        }
        return formatDateLabel(bucket);
    }

    function buildLinePath(points) {
        if (points.length === 0) return '';
        if (points.length === 1) return 'M' + points[0].x + ',' + points[0].y;
        var d = 'M' + points[0].x + ',' + points[0].y;
        for (var i = 1; i < points.length; i++) {
            var prev = points[i - 1];
            var curr = points[i];
            var cpx = (prev.x + curr.x) / 2;
            d += ' C' + cpx + ',' + prev.y + ' ' + cpx + ',' + curr.y + ' ' + curr.x + ',' + curr.y;
        }
        return d;
    }

    function buildStepPath(points) {
        if (points.length === 0) return '';
        if (points.length === 1) return 'M' + points[0].x + ',' + points[0].y;
        var d = 'M' + points[0].x + ',' + points[0].y;
        for (var i = 1; i < points.length; i++) {
            // Horizontal to new x, then vertical to new y
            d += ' H' + points[i].x + ' V' + points[i].y;
        }
        return d;
    }

    function buildAreaPath(points, baseY) {
        if (points.length === 0) return '';
        var d = 'M' + points[0].x + ',' + baseY;
        d += ' L' + points[0].x + ',' + points[0].y;
        for (var i = 1; i < points.length; i++) {
            var prev = points[i - 1];
            var curr = points[i];
            var cpx = (prev.x + curr.x) / 2;
            d += ' C' + cpx + ',' + prev.y + ' ' + cpx + ',' + curr.y + ' ' + curr.x + ',' + curr.y;
        }
        d += ' L' + points[points.length - 1].x + ',' + baseY + ' Z';
        return d;
    }

    // --- Set lookup for tooltips ---

    function getSetsForDate(data, movementName, dateStr) {
        var normalizedName = movementName.trim().toLowerCase();
        var workouts = data.workouts || [];
        var sets = [];
        for (var w = 0; w < workouts.length; w++) {
            if (workouts[w].date !== dateStr) continue;
            var movements = workouts[w].movements || [];
            for (var m = 0; m < movements.length; m++) {
                if (movements[m].name.trim().toLowerCase() !== normalizedName) continue;
                var movSets = movements[m].sets || [];
                for (var s = 0; s < movSets.length; s++) {
                    var weight = parseFloat(movSets[s].weight);
                    var reps = parseInt(movSets[s].reps, 10);
                    if (!isFinite(reps) || reps <= 0) reps = 1;
                    if (isFinite(weight) && weight > 0) {
                        sets.push({ weight: weight, reps: reps });
                    }
                }
            }
        }
        return sets;
    }

    // highlight: 'max', 'min', 'avg', 'pr', 'volume', or null
    function buildTooltipContent(dateStr, sets, highlight) {
        var header = formatDateLabel(dateStr);
        var items = []; // { text, bold, highlight, muted }

        // Find which set index to highlight for max/min/pr
        var maxIdx = -1, minIdx = -1, maxW = -Infinity, minW = Infinity;
        for (var i = 0; i < sets.length; i++) {
            if (sets[i].weight > maxW) { maxW = sets[i].weight; maxIdx = i; }
            if (sets[i].weight < minW) { minW = sets[i].weight; minIdx = i; }
        }

        items.push({ text: header, bold: true });
        for (var i = 0; i < sets.length; i++) {
            var hl = false;
            if ((highlight === 'max' || highlight === 'pr') && i === maxIdx) hl = true;
            if (highlight === 'min' && i === minIdx) hl = true;
            items.push({ text: sets[i].weight + ' x ' + sets[i].reps, highlight: hl });
        }

        // Summary line for avg or volume
        if (highlight === 'avg') {
            var sum = 0;
            for (var i = 0; i < sets.length; i++) sum += sets[i].weight;
            items.push({ text: 'avg: ' + Math.round(sum / sets.length), muted: true });
        } else if (highlight === 'volume') {
            var vol = 0;
            for (var i = 0; i < sets.length; i++) vol += sets[i].weight * sets[i].reps;
            items.push({ text: 'vol: ' + vol.toLocaleString(), muted: true });
        }

        return items;
    }

    // --- Tooltip DOM ---

    var tooltip = document.createElement('div');
    tooltip.className = 'heavy-tooltip';
    tooltip.style.display = 'none';
    document.body.appendChild(tooltip);

    function showTooltip(svgCircle, items) {
        tooltip.innerHTML = '';
        for (var i = 0; i < items.length; i++) {
            var div = document.createElement('div');
            div.textContent = items[i].text;
            if (items[i].bold) div.style.fontWeight = 'bold';
            if (items[i].highlight) {
                div.style.color = '#fff';
                div.style.background = 'rgba(255,255,255,0.15)';
                div.style.borderRadius = '3px';
                div.style.padding = '1px 4px';
                div.style.margin = '0 -4px';
                div.style.fontWeight = 'bold';
            }
            if (items[i].muted) {
                div.style.borderTop = '1px solid rgba(255,255,255,0.2)';
                div.style.marginTop = '4px';
                div.style.paddingTop = '4px';
                div.style.opacity = '0.7';
                div.style.fontSize = '13px';
            }
            tooltip.appendChild(div);
        }
        tooltip.style.display = '';

        var rect = svgCircle.getBoundingClientRect();
        var tipW = tooltip.offsetWidth;
        var tipH = tooltip.offsetHeight;
        var left = rect.left + rect.width / 2 - tipW / 2 + window.scrollX;
        var top = rect.top - tipH - 8 + window.scrollY;
        if (left < 4) left = 4;
        if (left + tipW > document.documentElement.clientWidth - 4) {
            left = document.documentElement.clientWidth - tipW - 4;
        }
        if (top < 4) top = rect.bottom + 8 + window.scrollY;
        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
    }

    function hideTooltip() {
        tooltip.style.display = 'none';
    }

    function addHitTargets(svg, pts, chartData, dateFn, highlight) {
        for (var i = 0; i < pts.length; i++) {
            (function (idx) {
                var hit = svgEl('circle', {
                    cx: pts[idx].x, cy: pts[idx].y, r: '12',
                    fill: 'transparent', stroke: 'none', style: 'cursor:pointer'
                });
                hit.addEventListener('mouseenter', function () {
                    var dateStr = dateFn(idx);
                    var sets = getSetsForDate(currentData, currentMovement, dateStr);
                    if (sets.length > 0) {
                        showTooltip(hit, buildTooltipContent(dateStr, sets, highlight));
                    }
                });
                hit.addEventListener('mouseleave', hideTooltip);
                svg.appendChild(hit);
            })(i);
        }
    }

    // --- Stats computation ---

    function computeStats(data, movementName) {
        if (!data || !movementName || movementName === '__all__') return null;
        var allData = aggregateChartData(data, movementName, 'All');
        if (allData.length === 0) return null;

        // All-time PR
        var pr = -Infinity;
        for (var i = 0; i < allData.length; i++) {
            if (allData[i].maxWeight > pr) pr = allData[i].maxWeight;
        }

        // Sessions count
        var sessions = allData.length;

        // Recent avg (last 5 sessions)
        var recentCount = Math.min(5, allData.length);
        var recentSum = 0;
        for (var i = allData.length - recentCount; i < allData.length; i++) {
            recentSum += allData[i].maxWeight;
        }
        var recentAvg = recentSum / recentCount;

        // 3-mo trend
        var threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
        var oldPoints = [];
        var newPoints = [];
        for (var i = 0; i < allData.length; i++) {
            var d = new Date(allData[i].date + 'T12:00:00Z');
            if (d < threeMonthsAgo) {
                oldPoints.push(allData[i].maxWeight);
            } else {
                newPoints.push(allData[i].maxWeight);
            }
        }
        var trend = null;
        if (oldPoints.length > 0 && newPoints.length > 0) {
            var oldAvg = 0;
            for (var i = 0; i < oldPoints.length; i++) oldAvg += oldPoints[i];
            oldAvg /= oldPoints.length;
            var newAvg = 0;
            for (var i = 0; i < newPoints.length; i++) newAvg += newPoints[i];
            newAvg /= newPoints.length;
            trend = newAvg - oldAvg;
        }

        return { pr: pr, recentAvg: recentAvg, sessions: sessions, trend: trend };
    }

    function renderStats() {
        if (!statsRow) return;
        var stats = computeStats(currentData, currentMovement);
        if (!stats) {
            statsRow.style.display = 'none';
            return;
        }
        statsRow.style.display = '';
        var cards = statsRow.querySelectorAll('.heavy-stat-value');
        cards[0].textContent = stats.pr;
        cards[1].textContent = Math.round(stats.recentAvg);
        cards[2].textContent = stats.sessions;
        if (stats.trend !== null) {
            var sign = stats.trend >= 0 ? '+' : '';
            cards[3].textContent = sign + Math.round(stats.trend);
            cards[3].className = 'heavy-stat-value ' + (stats.trend >= 0 ? 'heavy-stat-positive' : 'heavy-stat-negative');
        } else {
            cards[3].textContent = '—';
            cards[3].className = 'heavy-stat-value';
        }
    }

    // --- SVG rendering ---

    function svgEl(tag, attrs) {
        var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
        if (attrs) {
            for (var k in attrs) {
                el.setAttribute(k, attrs[k]);
            }
        }
        return el;
    }

    function drawGrid(svg, yTicks, xLabels, toY, plotWidth, plotHeight) {
        for (var i = 0; i < yTicks.length; i++) {
            var y = toY(yTicks[i]);
            svg.appendChild(svgEl('line', { x1: PADDING_LEFT, y1: y, x2: PADDING_LEFT + plotWidth, y2: y, stroke: '#d4d4d4', 'stroke-width': '0.5' }));
        }
        for (var i = 0; i < xLabels.length; i++) {
            svg.appendChild(svgEl('line', { x1: xLabels[i].x, y1: PADDING_TOP, x2: xLabels[i].x, y2: PADDING_TOP + plotHeight, stroke: '#d4d4d4', 'stroke-width': '0.5' }));
        }
    }

    function drawAxes(svg, plotWidth, plotHeight) {
        svg.appendChild(svgEl('line', { x1: PADDING_LEFT, y1: PADDING_TOP, x2: PADDING_LEFT, y2: PADDING_TOP + plotHeight, stroke: '#999', 'stroke-width': '1' }));
        svg.appendChild(svgEl('line', { x1: PADDING_LEFT, y1: PADDING_TOP + plotHeight, x2: PADDING_LEFT + plotWidth, y2: PADDING_TOP + plotHeight, stroke: '#999', 'stroke-width': '1' }));
    }

    function drawYLabels(svg, yTicks, toY) {
        for (var i = 0; i < yTicks.length; i++) {
            var y = toY(yTicks[i]);
            var txt = svgEl('text', { x: PADDING_LEFT - 8, y: y + 4, 'text-anchor': 'end', 'font-family': 'Schoolbell, cursive', 'font-size': '13', fill: '#666' });
            txt.textContent = yTicks[i];
            svg.appendChild(txt);
        }
    }

    function drawXLabels(svg, xLabels, plotHeight) {
        for (var i = 0; i < xLabels.length; i++) {
            var txt = svgEl('text', { x: xLabels[i].x, y: PADDING_TOP + plotHeight + 20, 'text-anchor': 'middle', 'font-family': 'Schoolbell, cursive', 'font-size': '12', fill: '#666' });
            txt.textContent = xLabels[i].label;
            svg.appendChild(txt);
        }
    }

    function computeXLabels(chartData, toX, formatFn) {
        var maxXLabels = 5;
        var step = Math.max(1, Math.ceil(chartData.length / maxXLabels));
        var xLabels = [];
        for (var i = 0; i < chartData.length; i += step) {
            xLabels.push({ label: formatFn(i), x: toX(i) });
        }
        var lastIdx = chartData.length - 1;
        if (lastIdx > 0 && lastIdx % step !== 0) {
            var lastX = toX(lastIdx);
            var prevX = xLabels.length > 0 ? xLabels[xLabels.length - 1].x : 0;
            if (lastX - prevX > 40) {
                xLabels.push({ label: formatFn(lastIdx), x: lastX });
            }
        }
        return xLabels;
    }

    // --- Legend update ---

    function updateLegend() {
        if (!legendEl) return;
        var items;
        if (currentChart === 'weight') {
            legendEl.innerHTML =
                '<span class="heavy-legend-item" data-series="max"><span class="heavy-legend-swatch" style="background:#333"></span> max</span>' +
                '<span class="heavy-legend-item" data-series="avg"><span class="heavy-legend-swatch" style="background:#777"></span> avg</span>' +
                '<span class="heavy-legend-item" data-series="min"><span class="heavy-legend-swatch" style="background:#bbb"></span> min</span>';
            items = legendEl.querySelectorAll('.heavy-legend-item');
            for (var i = 0; i < items.length; i++) {
                var s = items[i].getAttribute('data-series');
                items[i].classList.toggle('heavy-legend-item--disabled', !visibleSeries[s]);
            }
        } else if (currentChart === 'volume') {
            legendEl.innerHTML = '<span class="heavy-legend-item" data-series="volume"><span class="heavy-legend-swatch" style="background:#333"></span> volume</span>';
            var item = legendEl.querySelector('.heavy-legend-item');
            item.classList.toggle('heavy-legend-item--disabled', !visibleVolume.volume);
        } else if (currentChart === 'prs') {
            legendEl.innerHTML = '<span class="heavy-legend-item" data-series="pr"><span class="heavy-legend-swatch" style="background:#2e7d32"></span> PR</span>';
            var item = legendEl.querySelector('.heavy-legend-item');
            item.classList.toggle('heavy-legend-item--disabled', !visiblePR.pr);
        } else if (currentChart === 'frequency') {
            legendEl.innerHTML = '<span class="heavy-legend-item" data-series="freq"><span class="heavy-legend-swatch" style="background:#333"></span> sessions</span>';
            var item = legendEl.querySelector('.heavy-legend-item');
            item.classList.toggle('heavy-legend-item--disabled', !visibleFreq.freq);
        }
    }

    // --- Chart renderers ---

    function renderWeightChart() {
        var chartWidth = container.clientWidth || 680;
        var plotWidth = chartWidth - PADDING_LEFT - PADDING_RIGHT;
        var plotHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

        var chartData = aggregateChartData(currentData, currentMovement, currentRange);
        if (chartData.length === 0) {
            container.innerHTML = '<div class="heavy-no-data">no data for this range</div>';
            return;
        }

        // Compute axes based on visible series only
        var allMin = Infinity, allMax = -Infinity;
        for (var i = 0; i < chartData.length; i++) {
            if (visibleSeries.min && chartData[i].minWeight < allMin) allMin = chartData[i].minWeight;
            if (visibleSeries.avg && chartData[i].avgWeight < allMin) allMin = chartData[i].avgWeight;
            if (visibleSeries.max && chartData[i].maxWeight < allMin) allMin = chartData[i].maxWeight;
            if (visibleSeries.min && chartData[i].minWeight > allMax) allMax = chartData[i].minWeight;
            if (visibleSeries.avg && chartData[i].avgWeight > allMax) allMax = chartData[i].avgWeight;
            if (visibleSeries.max && chartData[i].maxWeight > allMax) allMax = chartData[i].maxWeight;
        }
        if (allMin === Infinity) { allMin = 0; allMax = 100; }

        var yTicks = niceTickValues(allMin, allMax, 5);
        var yMin = yTicks[0];
        var yMax = yTicks[yTicks.length - 1];
        var yRange = yMax - yMin || 1;

        function toX(idx) {
            return PADDING_LEFT + (chartData.length === 1 ? plotWidth / 2 : (idx / (chartData.length - 1)) * plotWidth);
        }
        function toY(val) {
            return PADDING_TOP + plotHeight - ((val - yMin) / yRange) * plotHeight;
        }

        var minPts = [], avgPts = [], maxPts = [];
        for (var i = 0; i < chartData.length; i++) {
            minPts.push({ x: toX(i), y: toY(chartData[i].minWeight) });
            avgPts.push({ x: toX(i), y: toY(chartData[i].avgWeight) });
            maxPts.push({ x: toX(i), y: toY(chartData[i].maxWeight) });
        }

        var xLabels = computeXLabels(chartData, toX, function (i) { return formatDateLabel(chartData[i].date); });

        var svg = svgEl('svg', { width: chartWidth, height: CHART_HEIGHT, viewBox: '0 0 ' + chartWidth + ' ' + CHART_HEIGHT });
        drawGrid(svg, yTicks, xLabels, toY, plotWidth, plotHeight);
        drawYLabels(svg, yTicks, toY);
        drawXLabels(svg, xLabels, plotHeight);
        drawAxes(svg, plotWidth, plotHeight);

        function drawSeries(pts, color, width, radius) {
            var path = svgEl('path', { d: buildLinePath(pts), stroke: color, 'stroke-width': width, fill: 'none', 'stroke-linecap': 'round' });
            svg.appendChild(path);
            for (var i = 0; i < pts.length; i++) {
                svg.appendChild(svgEl('circle', { cx: pts[i].x, cy: pts[i].y, r: radius, fill: color }));
            }
        }

        if (visibleSeries.min) drawSeries(minPts, '#bbb', '2', '3');
        if (visibleSeries.avg) drawSeries(avgPts, '#777', '2', '3');
        if (visibleSeries.max) drawSeries(maxPts, '#333', '2.5', '3.5');

        // Hit targets for tooltips on each visible series
        if (visibleSeries.min) addHitTargets(svg, minPts, chartData, function (idx) { return chartData[idx].date; }, 'min');
        if (visibleSeries.avg) addHitTargets(svg, avgPts, chartData, function (idx) { return chartData[idx].date; }, 'avg');
        if (visibleSeries.max) addHitTargets(svg, maxPts, chartData, function (idx) { return chartData[idx].date; }, 'max');

        container.appendChild(svg);
    }

    function renderVolumeChart() {
        var chartWidth = container.clientWidth || 680;
        var plotWidth = chartWidth - PADDING_LEFT - PADDING_RIGHT;
        var plotHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

        var chartData = aggregateVolumeData(currentData, currentMovement, currentRange);
        if (chartData.length === 0) {
            container.innerHTML = '<div class="heavy-no-data">no data for this range</div>';
            return;
        }

        var allMin = Infinity, allMax = -Infinity;
        for (var i = 0; i < chartData.length; i++) {
            if (chartData[i].volume < allMin) allMin = chartData[i].volume;
            if (chartData[i].volume > allMax) allMax = chartData[i].volume;
        }

        var yTicks = niceTickValues(allMin, allMax, 5);
        var yMin = yTicks[0];
        var yMax = yTicks[yTicks.length - 1];
        var yRange = yMax - yMin || 1;

        function toX(idx) {
            return PADDING_LEFT + (chartData.length === 1 ? plotWidth / 2 : (idx / (chartData.length - 1)) * plotWidth);
        }
        function toY(val) {
            return PADDING_TOP + plotHeight - ((val - yMin) / yRange) * plotHeight;
        }

        var pts = [];
        for (var i = 0; i < chartData.length; i++) {
            pts.push({ x: toX(i), y: toY(chartData[i].volume) });
        }

        var xLabels = computeXLabels(chartData, toX, function (i) { return formatDateLabel(chartData[i].date); });

        var svg = svgEl('svg', { width: chartWidth, height: CHART_HEIGHT, viewBox: '0 0 ' + chartWidth + ' ' + CHART_HEIGHT });
        drawGrid(svg, yTicks, xLabels, toY, plotWidth, plotHeight);
        drawYLabels(svg, yTicks, toY);
        drawXLabels(svg, xLabels, plotHeight);
        drawAxes(svg, plotWidth, plotHeight);

        if (visibleVolume.volume) {
            // Area fill
            var baseY = PADDING_TOP + plotHeight;
            var areaPath = svgEl('path', { d: buildAreaPath(pts, baseY), fill: 'rgba(51,51,51,0.08)', stroke: 'none' });
            svg.appendChild(areaPath);
            // Line
            var line = svgEl('path', { d: buildLinePath(pts), stroke: '#333', 'stroke-width': '2.5', fill: 'none', 'stroke-linecap': 'round' });
            svg.appendChild(line);
            for (var i = 0; i < pts.length; i++) {
                svg.appendChild(svgEl('circle', { cx: pts[i].x, cy: pts[i].y, r: '3', fill: '#333' }));
            }
        }

        addHitTargets(svg, pts, chartData, function (idx) { return chartData[idx].date; }, 'volume');

        container.appendChild(svg);
    }

    function renderPRChart() {
        var chartWidth = container.clientWidth || 680;
        var plotWidth = chartWidth - PADDING_LEFT - PADDING_RIGHT;
        var plotHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

        var chartData = aggregatePRData(currentData, currentMovement, currentRange);
        if (chartData.length === 0) {
            container.innerHTML = '<div class="heavy-no-data">no PRs for this range</div>';
            return;
        }

        var allMin = Infinity, allMax = -Infinity;
        for (var i = 0; i < chartData.length; i++) {
            if (chartData[i].weight < allMin) allMin = chartData[i].weight;
            if (chartData[i].weight > allMax) allMax = chartData[i].weight;
        }

        var yTicks = niceTickValues(allMin, allMax, 5);
        var yMin = yTicks[0];
        var yMax = yTicks[yTicks.length - 1];
        var yRange = yMax - yMin || 1;

        function toX(idx) {
            return PADDING_LEFT + (chartData.length === 1 ? plotWidth / 2 : (idx / (chartData.length - 1)) * plotWidth);
        }
        function toY(val) {
            return PADDING_TOP + plotHeight - ((val - yMin) / yRange) * plotHeight;
        }

        var pts = [];
        for (var i = 0; i < chartData.length; i++) {
            pts.push({ x: toX(i), y: toY(chartData[i].weight) });
        }

        var xLabels = computeXLabels(chartData, toX, function (i) { return formatDateLabel(chartData[i].date); });

        var svg = svgEl('svg', { width: chartWidth, height: CHART_HEIGHT, viewBox: '0 0 ' + chartWidth + ' ' + CHART_HEIGHT });
        drawGrid(svg, yTicks, xLabels, toY, plotWidth, plotHeight);
        drawYLabels(svg, yTicks, toY);
        drawXLabels(svg, xLabels, plotHeight);
        drawAxes(svg, plotWidth, plotHeight);

        if (visiblePR.pr) {
            // Stepped line
            var stepPath = svgEl('path', { d: buildStepPath(pts), stroke: '#2e7d32', 'stroke-width': '2.5', fill: 'none', 'stroke-linecap': 'round' });
            svg.appendChild(stepPath);
            // PR points with labels
            for (var i = 0; i < pts.length; i++) {
                svg.appendChild(svgEl('circle', { cx: pts[i].x, cy: pts[i].y, r: '5', fill: '#2e7d32' }));
                var label = svgEl('text', {
                    x: pts[i].x, y: pts[i].y - 12,
                    'text-anchor': 'middle', 'font-family': 'Schoolbell, cursive', 'font-size': '12', fill: '#2e7d32', 'font-weight': 'bold'
                });
                label.textContent = chartData[i].weight;
                svg.appendChild(label);
            }
        }

        addHitTargets(svg, pts, chartData, function (idx) { return chartData[idx].date; }, 'pr');

        container.appendChild(svg);
    }

    function renderFrequencyChart() {
        var chartWidth = container.clientWidth || 680;
        var plotWidth = chartWidth - PADDING_LEFT - PADDING_RIGHT;
        var plotHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
        var useBigBuckets = (currentRange === 'All' || currentRange === '1Y');

        var chartData = aggregateFrequencyData(currentData, currentMovement, currentRange);
        if (chartData.length === 0) {
            container.innerHTML = '<div class="heavy-no-data">no data for this range</div>';
            return;
        }

        var maxCount = 0;
        for (var i = 0; i < chartData.length; i++) {
            if (chartData[i].count > maxCount) maxCount = chartData[i].count;
        }

        var yTicks = niceIntegerTicks(0, maxCount, 5);
        var yMin = 0;
        var yMax = yTicks[yTicks.length - 1];
        var yRange = yMax - yMin || 1;

        function toY(val) {
            return PADDING_TOP + plotHeight - ((val - yMin) / yRange) * plotHeight;
        }

        var barGap = 4;
        var totalGaps = (chartData.length - 1) * barGap;
        var barWidth = Math.max(4, (plotWidth - totalGaps) / chartData.length);
        if (barWidth > 40) barWidth = 40;
        var totalBarsWidth = chartData.length * barWidth + totalGaps;
        var offsetX = PADDING_LEFT + (plotWidth - totalBarsWidth) / 2;

        function barX(idx) {
            return offsetX + idx * (barWidth + barGap);
        }

        var xLabels = [];
        var labelStep = Math.max(1, Math.ceil(chartData.length / 5));
        for (var i = 0; i < chartData.length; i += labelStep) {
            xLabels.push({ label: formatBucketLabel(chartData[i].bucket, useBigBuckets), x: barX(i) + barWidth / 2 });
        }

        var svg = svgEl('svg', { width: chartWidth, height: CHART_HEIGHT, viewBox: '0 0 ' + chartWidth + ' ' + CHART_HEIGHT });
        drawGrid(svg, yTicks, xLabels, toY, plotWidth, plotHeight);
        drawYLabels(svg, yTicks, toY);
        drawXLabels(svg, xLabels, plotHeight);
        drawAxes(svg, plotWidth, plotHeight);

        if (visibleFreq.freq) {
            var baseY = PADDING_TOP + plotHeight;
            for (var i = 0; i < chartData.length; i++) {
                var barH = baseY - toY(chartData[i].count);
                if (barH < 1) barH = 1;
                svg.appendChild(svgEl('rect', {
                    x: barX(i), y: baseY - barH,
                    width: barWidth, height: barH,
                    fill: '#333', rx: Math.min(3, barWidth / 2)
                }));
            }
            // Hit targets for bar tooltips
            for (var i = 0; i < chartData.length; i++) {
                (function (idx) {
                    var hit = svgEl('rect', {
                        x: barX(idx), y: PADDING_TOP,
                        width: barWidth, height: plotHeight,
                        fill: 'transparent', stroke: 'none', style: 'cursor:pointer'
                    });
                    hit.addEventListener('mouseenter', function () {
                        var label = formatBucketLabel(chartData[idx].bucket, useBigBuckets);
                        var count = chartData[idx].count;
                        var items = [
                            { text: label, bold: true },
                            { text: count + ' session' + (count !== 1 ? 's' : '') }
                        ];
                        showTooltip(hit, items);
                    });
                    hit.addEventListener('mouseleave', hideTooltip);
                    svg.appendChild(hit);
                })(i);
            }
        }

        container.appendChild(svg);
    }

    // --- Main render ---

    function renderChart() {
        if (!container || !currentData || !currentMovement) return;
        container.innerHTML = '';
        hideTooltip();
        updateLegend();
        renderStats();
        updateMovementDropdown();

        switch (currentChart) {
            case 'weight': renderWeightChart(); break;
            case 'volume': renderVolumeChart(); break;
            case 'prs': renderPRChart(); break;
            case 'frequency': renderFrequencyChart(); break;
        }
    }

    // --- Movement dropdown: add "All Movements" for frequency ---

    function updateMovementDropdown() {
        if (!movementSelect || !currentData) return;
        var names = getAllMovementNames(currentData);
        var hasAll = movementSelect.querySelector('option[value="__all__"]');

        if (currentChart === 'frequency') {
            if (!hasAll) {
                var opt = document.createElement('option');
                opt.value = '__all__';
                opt.textContent = 'All Movements';
                movementSelect.insertBefore(opt, movementSelect.firstChild);
            }
        } else {
            if (hasAll) {
                movementSelect.removeChild(hasAll);
                if (currentMovement === '__all__') {
                    currentMovement = movementSelect.value || (names.length > 0 ? names[0] : null);
                }
            }
        }
    }

    // --- Event binding ---

    if (movementSelect) {
        movementSelect.addEventListener('change', function () {
            currentMovement = this.value;
            renderChart();
        });
    }

    if (rangeBar) {
        rangeBar.addEventListener('click', function (e) {
            var btn = e.target.closest('.heavy-range-btn');
            if (!btn) return;
            currentRange = btn.getAttribute('data-range');
            var btns = rangeBar.querySelectorAll('.heavy-range-btn');
            for (var i = 0; i < btns.length; i++) {
                btns[i].classList.toggle('heavy-range-btn--active', btns[i] === btn);
            }
            renderChart();
        });
    }

    // Tab bar
    if (tabBar) {
        tabBar.addEventListener('click', function (e) {
            var btn = e.target.closest('.heavy-tab-btn');
            if (!btn) return;
            currentChart = btn.getAttribute('data-chart');
            var btns = tabBar.querySelectorAll('.heavy-tab-btn');
            for (var i = 0; i < btns.length; i++) {
                btns[i].classList.toggle('heavy-tab-btn--active', btns[i] === btn);
            }
            renderChart();
        });
    }

    // Interactive legend
    if (legendEl) {
        legendEl.addEventListener('click', function (e) {
            var item = e.target.closest('.heavy-legend-item');
            if (!item) return;
            var series = item.getAttribute('data-series');
            if (!series) return;

            if (currentChart === 'weight') {
                visibleSeries[series] = !visibleSeries[series];
                // Don't let all be hidden
                if (!visibleSeries.max && !visibleSeries.avg && !visibleSeries.min) {
                    visibleSeries[series] = true;
                    return;
                }
            } else if (currentChart === 'volume') {
                visibleVolume[series] = !visibleVolume[series];
            } else if (currentChart === 'prs') {
                visiblePR[series] = !visiblePR[series];
            } else if (currentChart === 'frequency') {
                visibleFreq[series] = !visibleFreq[series];
            }
            renderChart();
        });
    }

    // Re-render on resize
    var resizeTimer;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(renderChart, 150);
    });

    // --- Share ---

    // Cache for base64-encoded Schoolbell font
    var schoolbellBase64 = null;

    function loadFontBase64() {
        if (schoolbellBase64) return Promise.resolve(schoolbellBase64);
        return fetch('/assets/fonts/Schoolbell-Regular.ttf')
            .then(function (r) { return r.arrayBuffer(); })
            .then(function (buf) {
                var bytes = new Uint8Array(buf);
                var binary = '';
                for (var i = 0; i < bytes.length; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                schoolbellBase64 = btoa(binary);
                return schoolbellBase64;
            });
    }

    function rasterizeSvgWithFont(svgEl, fontB64) {
        // Clone the SVG, embed the font as base64 @font-face, serialize, draw to canvas
        var clone = svgEl.cloneNode(true);
        var defs = clone.querySelector('defs') || document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        if (!defs.parentNode) clone.insertBefore(defs, clone.firstChild);

        var styleEl = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        styleEl.textContent = '@font-face { font-family: "Schoolbell"; src: url(data:font/ttf;base64,' + fontB64 + ') format("truetype"); }';
        defs.appendChild(styleEl);

        var serializer = new XMLSerializer();
        var svgStr = serializer.serializeToString(clone);
        var blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        var url = URL.createObjectURL(blob);

        var w = svgEl.getAttribute('width') || svgEl.clientWidth;
        var h = svgEl.getAttribute('height') || svgEl.clientHeight;
        var scale = 2;

        return new Promise(function (resolve) {
            var img = new Image();
            img.onload = function () {
                var c = document.createElement('canvas');
                c.width = w * scale;
                c.height = h * scale;
                var ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0, c.width, c.height);
                URL.revokeObjectURL(url);
                resolve(c);
            };
            img.onerror = function () {
                URL.revokeObjectURL(url);
                resolve(null);
            };
            img.src = url;
        });
    }

    var chartTabLabels = { weight: 'Weight', volume: 'Volume', prs: 'PRs', frequency: 'Frequency' };

    function shareChart() {
        var wrap = document.querySelector('.heavy-chart-wrap');
        if (!wrap) return;

        // Build share title like "PRs – DB Incline Press"
        var chartLabel = chartTabLabels[currentChart] || 'Weight';
        var movLabel = currentMovement === '__all__' ? 'All Movements' : (currentMovement || '');
        var shareTitle = chartLabel + ' \u2013 ' + movLabel;

        // Pre-rasterize the SVG with embedded font (no live DOM changes)
        var svgNode = wrap.querySelector('svg');
        if (!svgNode) return;
        var svgW = svgNode.getAttribute('width');
        var svgH = svgNode.getAttribute('height');

        loadFontBase64().then(function (fontB64) {
            return rasterizeSvgWithFont(svgNode, fontB64);
        }).then(function (svgCanvas) {
            var svgDataUrl = svgCanvas ? svgCanvas.toDataURL('image/png') : null;

            // All DOM manipulation happens only in the cloned document
            return html2canvas(wrap, {
                backgroundColor: '#ffffff',
                scale: 2,
                useCORS: true,
                onclone: function (clonedDoc) {
                    var clonedWrap = clonedDoc.querySelector('.heavy-chart-wrap');
                    if (!clonedWrap) return;

                    // Hide dropdown, tab bar, range bar
                    var sel = clonedWrap.querySelector('.heavy-movement-select');
                    var tabs = clonedWrap.querySelector('.heavy-tab-bar');
                    var range = clonedWrap.querySelector('.heavy-range-bar');
                    if (sel) sel.style.display = 'none';
                    if (tabs) tabs.style.display = 'none';
                    if (range) range.style.display = 'none';

                    // Hide disabled legend items
                    var disabled = clonedWrap.querySelectorAll('.heavy-legend-item--disabled');
                    for (var i = 0; i < disabled.length; i++) {
                        disabled[i].style.display = 'none';
                    }

                    // Inject title
                    var title = clonedDoc.createElement('div');
                    title.className = 'heavy-share-title';
                    title.textContent = shareTitle;
                    clonedWrap.insertBefore(title, clonedWrap.firstChild);

                    // Replace SVG with rasterized image
                    if (svgDataUrl) {
                        var clonedSvg = clonedWrap.querySelector('svg');
                        if (clonedSvg) {
                            var img = clonedDoc.createElement('img');
                            img.src = svgDataUrl;
                            img.style.width = svgW + 'px';
                            img.style.height = svgH + 'px';
                            img.style.display = 'block';
                            clonedSvg.parentNode.replaceChild(img, clonedSvg);
                        }
                    }
                }
            });
        }).then(function (canvas) {
            if (!canvas) return;

            var s = 2;
            var pad = 56 * s;
            var logoSize = 36 * s;
            var margin = 24 * s;
            var footerColor = '#f9faf9';

            var finalCanvas = document.createElement('canvas');
            finalCanvas.width = canvas.width;
            finalCanvas.height = canvas.height + pad;
            var ctx = finalCanvas.getContext('2d');

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, finalCanvas.width, canvas.height);
            ctx.drawImage(canvas, 0, 0);

            ctx.fillStyle = footerColor;
            ctx.fillRect(0, canvas.height, finalCanvas.width, pad);

            var centerX = finalCanvas.width / 2;
            var rightEdge = finalCanvas.width - margin;
            var wmCenterY = canvas.height + pad / 2;

            function drawWatermark(logoImg) {
                ctx.font = 'bold ' + (20 * s) + 'px Schoolbell, cursive';
                ctx.fillStyle = '#333';
                ctx.textAlign = 'left';
                var nameWidth = ctx.measureText('Liftbook').width;
                var blockWidth = logoSize + 10 * s + nameWidth;
                var blockX = centerX - blockWidth / 2;

                if (logoImg) {
                    ctx.drawImage(logoImg, blockX, wmCenterY - logoSize / 2, logoSize, logoSize);
                }
                ctx.textBaseline = 'middle';
                ctx.fillText('Liftbook', blockX + logoSize + 10 * s, wmCenterY);

                ctx.font = (13 * s) + 'px system-ui, sans-serif';
                ctx.fillStyle = '#555';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText('liftbookapp.com/heavy', rightEdge, wmCenterY);

                doShare(finalCanvas);
            }

            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () { drawWatermark(img); };
            img.onerror = function () { drawWatermark(null); };
            img.src = '/assets/images/app-icon.png';
        }).catch(function (err) {
            console.error('[Heavy] Share failed:', err);
        });
    }

    function doShare(canvas) {
        canvas.toBlob(function (blob) {
            if (!blob) return;
            var file = new File([blob], 'liftbook-chart.png', { type: 'image/png' });

            var shareData = {
                text: 'Check out this chart I made with Liftbook Heavy\nhttps://liftbookapp.com/heavy'
            };

            // iOS/Android: native share with image file
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                shareData.files = [file];
                navigator.share(shareData).catch(function () { });
                return;
            }

            // macOS Safari: share sheet without file (shares text + downloads image)
            if (navigator.share) {
                var a = document.createElement('a');
                var url = URL.createObjectURL(blob);
                a.href = url;
                a.download = 'liftbook-chart.png';
                a.click();
                navigator.share(shareData).catch(function () { });
                setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
                return;
            }

            // Final fallback: just download
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'liftbook-chart.png';
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
        }, 'image/png');
    }

    // Bind share button
    var shareBtn = document.getElementById('share-chart-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', shareChart);
    }

    // --- Public API for heavy.js to call ---

    window.HeavyChart = {
        load: function (data) {
            currentData = data;
            currentRange = 'All';
            currentChart = 'weight';
            visibleSeries = { max: true, avg: true, min: true };

            // Populate movement dropdown
            var names = getAllMovementNames(data);
            var recent = findMostRecentMovement(data);
            movementSelect.innerHTML = '';
            for (var i = 0; i < names.length; i++) {
                var opt = document.createElement('option');
                opt.value = names[i];
                opt.textContent = names[i];
                if (names[i] === recent) opt.selected = true;
                movementSelect.appendChild(opt);
            }
            currentMovement = recent || (names.length > 0 ? names[0] : null);

            // Reset range buttons
            var btns = rangeBar.querySelectorAll('.heavy-range-btn');
            for (var i = 0; i < btns.length; i++) {
                btns[i].classList.toggle('heavy-range-btn--active', btns[i].getAttribute('data-range') === 'All');
            }

            // Reset tab buttons
            if (tabBar) {
                var tabBtns = tabBar.querySelectorAll('.heavy-tab-btn');
                for (var i = 0; i < tabBtns.length; i++) {
                    tabBtns[i].classList.toggle('heavy-tab-btn--active', tabBtns[i].getAttribute('data-chart') === 'weight');
                }
            }

            renderChart();
        }
    };
})();
