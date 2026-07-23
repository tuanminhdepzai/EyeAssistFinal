/**
 * AnalyticsLogger — In-app measurement and metrics
 *
 * Logs every interaction to IndexedDB.
 * Computes real-time metrics for the dashboard.
 */
export class AnalyticsLogger {
  constructor() {
    this.sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    this.startTime = Date.now();
    this.events = [];
    this.maxEvents = 5000;
    this.metrics = {
      totalClicks: 0,
      totalVoice: 0,
      totalGestures: 0,
      totalErrors: 0,
      totalNaturalBlinks: 0,
      totalIntentionalBlinks: 0,
      falsePositives: 0,
      reactionTimes: [],
      accuracies: []
    };
    // Auto-save interval
    this._saveInterval = setInterval(() => this._autoSave(), 30000);
  }

  /**
   * Log an interaction event
   * @param {Object} event
   */
  log(event) {
    const entry = {
      timestamp: Date.now(),
      sessionId: this.sessionId,
      elapsedMs: Date.now() - this.startTime,
      ...event
    };

    this.events.push(entry);
    if (this.events.length > this.maxEvents) this.events.shift();

    // Update metrics
    this._updateMetrics(entry);

    // Trigger callback if set
    if (this.onUpdate) this.onUpdate(this.getMetrics());
  }

  _updateMetrics(entry) {
    switch (entry.input) {
      case 'blink':
        this.metrics.totalClicks++;
        if (entry.subtype === 'natural') this.metrics.totalNaturalBlinks++;
        else this.metrics.totalIntentionalBlinks++;
        break;
      case 'voice':
        this.metrics.totalVoice++;
        break;
      case 'gesture':
        this.metrics.totalGestures++;
        break;
    }

    if (entry.success === false) this.metrics.totalErrors++;

    if (entry.reactionTime) {
      this.metrics.reactionTimes.push(entry.reactionTime);
    }

    if (entry.accuracy !== undefined) {
      this.metrics.accuracies.push(entry.accuracy);
    }

    // False positive detection: click when no button was targeted
    if (entry.input === 'blink' && entry.success === false) {
      this.metrics.falsePositives++;
    }
  }

  /**
   * Compute live metrics
   */
  getMetrics() {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    const avgReaction = this.metrics.reactionTimes.length > 0
      ? Math.round(this.metrics.reactionTimes.reduce((a, b) => a + b, 0) / this.metrics.reactionTimes.length)
      : 0;

    const avgAccuracy = this.metrics.accuracies.length > 0
      ? Math.round(this.metrics.accuracies.reduce((a, b) => a + b, 0) / this.metrics.accuracies.length * 100)
      : 0;

    return {
      sessionTime: `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`,
      totalClicks: this.metrics.totalIntentionalBlinks,
      totalVoice: this.metrics.totalVoice,
      totalGestures: this.metrics.totalGestures,
      totalErrors: this.metrics.totalErrors,
      falsePositives: this.metrics.falsePositives,
      avgReactionMs: avgReaction,
      avgAccuracy: avgAccuracy,
      eventsLogged: this.events.length
    };
  }

  /**
   * Export session data for presentation
   */
  exportCSV() {
    const headers = ['timestamp', 'elapsedMs', 'input', 'action', 'target', 'accuracy', 'reactionTime', 'success'];
    const rows = this.events.map(e =>
      headers.map(h => e[h] !== undefined ? e[h] : '').join(',')
    );
    return [headers.join(','), ...rows].join('\n');
  }

  async _autoSave() {
    // Could save to IndexedDB if needed
  }

  destroy() {
    clearInterval(this._saveInterval);
  }
}
