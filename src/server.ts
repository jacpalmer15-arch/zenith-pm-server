import 'dotenv/config';
import { createApp } from '@/app.js';
import { env } from '@/config/env.js';

const app = createApp();
const port = env.PORT;

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log(`Environment: ${env.NODE_ENV}`);
  console.log(`Log level: ${env.LOG_LEVEL}`);
});
