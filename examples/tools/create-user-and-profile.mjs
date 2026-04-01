// Sequential: create user, then fetch their profile using the returned ID
export default async function(params, ctx) {
  const { http, auth } = ctx;
  const headers = { ...auth };

  const user = await http.post('https://api.example.com/users', {
    headers,
    body: { username: params.username, email: params.email, password: params.password },
  });

  const profile = await http.get(`https://api.example.com/users/${user.id}/profile`, {
    headers,
  });

  return { user, profile };
}
