import { getStudent } from '@/lib/student';
import { IslandWorld } from './islands';

export default async function Home() {
  const student = await getStudent();
  return <IslandWorld name={student?.firstName || 'there'} />;
}
