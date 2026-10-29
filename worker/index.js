// Cloudflare Worker: site/ 정적 파일은 assets가 바로 보내고, /api/*만 여기로 옴 (wrangler.toml run_worker_first)
import { fail } from './rules.js';
import { list, create, report, remove } from './comments.js';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (!env.DB) return fail('NO_DB', '코멘트 저장소가 아직 연결되지 않았어요.', 503);
    const m = request.method;
    try {
      if (pathname === '/api/comments') {
        if (m === 'GET') return await list(request, env);
        if (m === 'POST') return await create(request, env);
      } else if (pathname === '/api/comments/report') {
        if (m === 'POST') return await report(request, env);
      } else {
        const id = pathname.match(/^\/api\/comments\/(\d+)$/)?.[1];
        if (id && m === 'DELETE') return await remove(request, env, id);
        return fail('NOT_FOUND', '없는 주소예요.', 404);
      }
      return fail('METHOD', '지원하지 않는 요청이에요.', 405);
    } catch (e) {
      console.error(e);
      return fail('SERVER', '잠시 뒤에 다시 시도해주세요.', 500);
    }
  },
};
