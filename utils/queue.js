/**
 * File d'attente simple : un seul job exécuté à la fois.
 * `worker` est une fonction async(job) => Promise<void> fournie à la création.
 */
class JobQueue {
  constructor(worker) {
    this.worker = worker;
    this.jobs = [];
    this.isProcessing = false;
  }

  /**
   * Ajoute un job à la file. Retourne sa position (1 = en cours d'exécution immédiate).
   */
  add(job) {
    this.jobs.push(job);
    const position = this.jobs.length;

    if (!this.isProcessing) {
      this._processNext();
    }

    return position;
  }

  size() {
    return this.jobs.length;
  }
  isBusy() {
    return this.isProcessing;
  }

  async _processNext() {
    if (this.jobs.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const job = this.jobs.shift();

    try {
      await this.worker(job);
    } catch (err) {
      console.error("❌ Erreur non gérée dans le worker de la queue :", err);
    }

    // Passe automatiquement au suivant, que le job précédent ait réussi ou non
    this._processNext();
  }
}

module.exports = JobQueue;
