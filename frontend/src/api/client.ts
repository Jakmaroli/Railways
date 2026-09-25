import axios from "axios";

export function getCsrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)railsync_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

const client = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

// Defense-in-depth CSRF token attachment for state-changing requests
client.interceptors.request.use((config) => {
  const method = config.method?.toUpperCase();
  if (method && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) {
      config.headers["X-CSRF-Token"] = csrfToken;
    }
  }
  return config;
});

// Response envelope unwrapping and standardized security error handling
client.interceptors.response.use(
  (res) => {
    if (res.data && typeof res.data === "object" && res.data.status === "success" && "data" in res.data) {
      res.data = res.data.data;
    }
    return res;
  },
  (err) => {
    const url = err.config?.url || "";
    const isLoginEndpoint = url.includes("/auth/railsync/login") || url.includes("/auth/login");

    if (err.response?.status === 401 && !isLoginEndpoint) {
      localStorage.removeItem("railsync_user");
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    if (err.response?.status === 429) {
      const retryAfter =
        err.response.headers?.["retry-after"] ||
        err.response.headers?.["Retry-After"];
      err.message = retryAfter
        ? `Too many attempts. Try again in ${retryAfter} seconds.`
        : "Too many attempts. Please try again later.";
    } else {
      const envelopeMessage = err.response?.data?.error?.message;
      if (envelopeMessage) {
        err.message = envelopeMessage;
      }
    }

    return Promise.reject(err);
  }
);

export default client;
