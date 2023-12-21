import { useRouter } from 'next/router';

export default function Page() {
  const router = useRouter()

  return (
  <div>
    <h1>My Page</h1>
    <h2>Slug: {router.query.id}</h2>
  </div>
  );
}
