import React from "react";
import "./App.css";
import { BrowserRouter as Router, Route, Routes, Link } from "react-router-dom";
import AIMeetingAssistant from "./pages/AIMeetingAssistant";
import ActionSense from "./pages/ActionSense";
import TeamAutoMatching from "./pages/TeamAutoMatching";
import FlowChain from "./pages/FlowChain";
import AIScheduler from "./pages/AIScheduler";
import RewardInsight from "./pages/RewardInsight";

function App() {
  return (
    <Router>
      <div className="app-container">
        <nav className="left-sidebar">
          <div className="logo">FlowDesk</div>
          <ul>
            <li>
              <Link to="/ai-meeting-assistant">AI 회의 비서</Link>
            </li>
            <li>
              <Link to="/actionsense">ActionSense</Link>
            </li>
            <li>
              <Link to="/team-auto-matching">팀 오토 매칭</Link>
            </li>
            <li>
              <Link to="/flowchain">FlowChain</Link>
            </li>
            <li>
              <Link to="/ai-scheduler">AI 일정 비서</Link>
            </li>
            <li>
              <Link to="/reward-insight">보너스 리워드 지표</Link>
            </li>
          </ul>
        </nav>

        <main className="content-area">
          <Routes>
            <Route
              path="/ai-meeting-assistant"
              element={<AIMeetingAssistant />}
            />
            <Route path="/actionsense" element={<ActionSense />} />
            <Route path="/team-auto-matching" element={<TeamAutoMatching />} />
            <Route path="/flowchain" element={<FlowChain />} />
            <Route path="/ai-scheduler" element={<AIScheduler />} />
            <Route path="/reward-insight" element={<RewardInsight />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
