import site from "../dist/server/index.js";

export default {
  fetch(request) {
    return site.fetch(request, {
      BACKEND_URL: process.env.BACKEND_URL,
      BACKEND_TOKEN: process.env.BACKEND_TOKEN,
    });
  },
};
