import React from "react";
import PageContainer from "../../../components/ui/PageContainer";
import SyncButton from "../../../components/ui/SyncButton";
import HomeFeed from "../components/HomeFeed";

const HomePage: React.FC = () => {
  return (
    <PageContainer
      title="Home"
      subtitle="Overview of notes, tasks, folders and quick actions"
      action={<SyncButton />}
    >
      <HomeFeed />
    </PageContainer>
  );
};

export default HomePage;