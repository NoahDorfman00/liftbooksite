(function () {
    var PADDING_LEFT = 52;
    var PADDING_RIGHT = 20;
    var PADDING_TOP = 16;
    var PADDING_BOTTOM = 36;
    var CHART_HEIGHT = 320;

    var container = document.getElementById('chart-container');
    var movementSelect = document.getElementById('movement-select');
    var rangeBar = document.getElementById('range-bar');

    var currentData = null;
    var currentRange = 'All';
    var currentMovement = null;

    // --- Data functions (ported from ChartScreen.tsx) ---

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

    function formatDateLabel(dateStr) {
        var d = new Date(dateStr + 'T12:00:00Z');
        var month = d.toLocaleString('default', { month: 'short', timeZone: 'UTC' });
        var day = d.getUTCDate();
        return month + ' ' + day;
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

    function renderChart() {
        if (!container || !currentData || !currentMovement) return;
        container.innerHTML = '';

        var chartWidth = container.clientWidth || 680;
        var plotWidth = chartWidth - PADDING_LEFT - PADDING_RIGHT;
        var plotHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

        var chartData = aggregateChartData(currentData, currentMovement, currentRange);

        if (chartData.length === 0) {
            container.innerHTML = '<div class="heavy-no-data">no data for this range</div>';
            return;
        }

        // Compute axes
        var allMin = Infinity, allMax = -Infinity;
        for (var i = 0; i < chartData.length; i++) {
            if (chartData[i].minWeight < allMin) allMin = chartData[i].minWeight;
            if (chartData[i].maxWeight > allMax) allMax = chartData[i].maxWeight;
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

        var minPts = [], avgPts = [], maxPts = [];
        for (var i = 0; i < chartData.length; i++) {
            minPts.push({ x: toX(i), y: toY(chartData[i].minWeight) });
            avgPts.push({ x: toX(i), y: toY(chartData[i].avgWeight) });
            maxPts.push({ x: toX(i), y: toY(chartData[i].maxWeight) });
        }

        // X labels
        var maxXLabels = 5;
        var step = Math.max(1, Math.ceil(chartData.length / maxXLabels));
        var xLabels = [];
        for (var i = 0; i < chartData.length; i += step) {
            xLabels.push({ label: formatDateLabel(chartData[i].date), x: toX(i) });
        }
        var lastIdx = chartData.length - 1;
        if (lastIdx > 0 && lastIdx % step !== 0) {
            var lastX = toX(lastIdx);
            var prevX = xLabels.length > 0 ? xLabels[xLabels.length - 1].x : 0;
            if (lastX - prevX > 40) {
                xLabels.push({ label: formatDateLabel(chartData[lastIdx].date), x: lastX });
            }
        }

        // Build SVG
        var svg = svgEl('svg', { width: chartWidth, height: CHART_HEIGHT, viewBox: '0 0 ' + chartWidth + ' ' + CHART_HEIGHT });

        // Grid lines
        for (var i = 0; i < yTicks.length; i++) {
            var y = toY(yTicks[i]);
            svg.appendChild(svgEl('line', { x1: PADDING_LEFT, y1: y, x2: PADDING_LEFT + plotWidth, y2: y, stroke: '#d4d4d4', 'stroke-width': '0.5' }));
        }
        for (var i = 0; i < xLabels.length; i++) {
            svg.appendChild(svgEl('line', { x1: xLabels[i].x, y1: PADDING_TOP, x2: xLabels[i].x, y2: PADDING_TOP + plotHeight, stroke: '#d4d4d4', 'stroke-width': '0.5' }));
        }

        // Y-axis labels
        for (var i = 0; i < yTicks.length; i++) {
            var y = toY(yTicks[i]);
            var txt = svgEl('text', { x: PADDING_LEFT - 8, y: y + 4, 'text-anchor': 'end', 'font-family': 'Schoolbell, cursive', 'font-size': '13', fill: '#666' });
            txt.textContent = yTicks[i];
            svg.appendChild(txt);
        }

        // X-axis labels
        for (var i = 0; i < xLabels.length; i++) {
            var txt = svgEl('text', { x: xLabels[i].x, y: PADDING_TOP + plotHeight + 20, 'text-anchor': 'middle', 'font-family': 'Schoolbell, cursive', 'font-size': '12', fill: '#666' });
            txt.textContent = xLabels[i].label;
            svg.appendChild(txt);
        }

        // Axes
        svg.appendChild(svgEl('line', { x1: PADDING_LEFT, y1: PADDING_TOP, x2: PADDING_LEFT, y2: PADDING_TOP + plotHeight, stroke: '#999', 'stroke-width': '1' }));
        svg.appendChild(svgEl('line', { x1: PADDING_LEFT, y1: PADDING_TOP + plotHeight, x2: PADDING_LEFT + plotWidth, y2: PADDING_TOP + plotHeight, stroke: '#999', 'stroke-width': '1' }));

        // Draw lines and circles
        function drawSeries(pts, color, width, radius) {
            var path = svgEl('path', { d: buildLinePath(pts), stroke: color, 'stroke-width': width, fill: 'none', 'stroke-linecap': 'round' });
            svg.appendChild(path);
            for (var i = 0; i < pts.length; i++) {
                svg.appendChild(svgEl('circle', { cx: pts[i].x, cy: pts[i].y, r: radius, fill: color }));
            }
        }

        drawSeries(minPts, '#bbb', '2', '3');
        drawSeries(avgPts, '#777', '2', '3');
        drawSeries(maxPts, '#333', '2.5', '3.5');

        container.appendChild(svg);
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

    // Re-render on resize
    var resizeTimer;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(renderChart, 150);
    });

    // --- Public API for heavy.js to call ---

    window.HeavyChart = {
        load: function (data) {
            currentData = data;
            currentRange = 'All';

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

            renderChart();
        }
    };
})();
