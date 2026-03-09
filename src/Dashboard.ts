import express from 'express';
import path from 'path';
import { Queue } from './Queue';

export class Dashboard {
  private app: express.Application;
  private server: any;

  constructor(private queue: Queue, private port: number = 3000) {
    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes() {
    this.app.use(express.static(path.join(__dirname, '../public')));

    this.app.get('/api/stats', async (req, res) => {
      try {
        const stats = await this.queue.getStats();
        res.json(stats);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  start() {
    this.server = this.app.listen(this.port, () => {
      console.log(`Dashboard started at http://localhost:${this.port}`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
    }
  }
}
