// Parallel: fetch user, orders, and notifications concurrently, then merge
export default async function(params, ctx) {
  const { http, auth } = ctx;
  const headers = { ...auth };

  const [user, orders, notifications] = await Promise.all([
    http.get(`https://api.example.com/users/${params.userId}`, { headers }),
    http.get(`https://api.example.com/users/${params.userId}/orders`, { headers }),
    http.get(`https://api.example.com/users/${params.userId}/notifications`, { headers }),
  ]);

  return {
    user,
    orderCount: orders.length,
    unreadNotifications: notifications.filter(n => !n.read).length,
  };
}
