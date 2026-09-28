import MyOpportunitiesScreen from './MyOpportunitiesScreen';

// The screen is a client component and cannot carry metadata; a layout here
// would name the post and edit pages beneath it too, so the title sits on
// this page alone.
export const metadata = { title: 'My opportunities' };

export default function MyOpportunitiesPage() {
  return <MyOpportunitiesScreen />;
}
