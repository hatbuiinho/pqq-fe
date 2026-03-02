import adapter from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: { adapter: adapter() },
	// chỉ ép runes cho code của bạn, không đụng node_modules
	vitePlugin: {
		dynamicCompileOptions({ filename, compileOptions }) {
			if (!filename.includes('node_modules') && compileOptions.runes !== true) {
				return { runes: true };
			}
		}
	},

	compilerOptions: {
		// runes: true,
		compatibility: {
			componentApi: 4
		}
	}
};

export default config;
