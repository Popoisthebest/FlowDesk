import React from "react";
import "./TeamAutoMatching.css";

const TeamAutoMatching = () => {
  const roles = ["백엔드", "프론트엔드", "디자인", "PM"];
  const timeSlots = ["오전", "오후", "야간"];
  const tags = [
    "#AI",
    "#데이터",
    "#모바일",
    "#UI",
    "#UX",
    "#React",
    "#앱",
    "#API",
  ];

  const candidateMembers = [
    {
      name: "민준",
      role: "백엔드",
      availability: "오후 1-6시",
      tags: ["#AI", "#백엔드", "#데이터"],
      affinity: 88,
    },
    {
      name: "서현",
      role: "프론트엔드",
      availability: "오전 9-12시",
      tags: ["#모바일", "#UI", "#UX"],
      affinity: 93,
    },
    {
      name: "지효",
      role: "프론트엔드",
      availability: "오후 2-7시",
      tags: ["#앱", "#React"],
      affinity: 85,
    },
  ];

  const recommendedTeam = [
    {
      name: "서현",
      role: "PM",
      availability: "오전 9-12시",
      tags: ["#앱", "#UI"],
      affinity: 93,
      addition: "+1",
    },
    {
      name: "지효",
      role: "프론트엔드",
      availability: "오후 2-7시",
      tags: ["#앱", "#React"],
      affinity: 85,
      addition: "+1",
    },
  ];

  return (
    <div className="team-auto-matching-container">
      {/* Top Bar */}
      {/* Main Content Area */}
      <div className="main-content">
        {/* Team Auto Matching Panel */}
        <div className="team-matching-panel">
          <div className="panel-header">
            <h1>팀 오토 매칭</h1>
            <p>역할 ∙ 시간대 ∙ 선호 태그 기반 추천</p>
          </div>

          <div className="filters">
            <div className="filter-group">
              <label>역할</label>
              <div className="tags-container">
                {roles.map((role) => (
                  <span key={role} className="tag role-tag">
                    {role}
                  </span>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <label>시간대</label>
              <div className="tags-container">
                {timeSlots.map((slot) => (
                  <span key={slot} className="tag time-tag">
                    {slot}
                  </span>
                ))}
              </div>
            </div>

            <div className="filter-group">
              <label>선호 태그</label>
              <div className="tags-container">
                {tags.map((tag) => (
                  <span key={tag} className="tag preference-tag">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="matching-results">
            <div className="candidate-members">
              <h2>후보 멤버</h2>
              <p>6명의 멤버</p>
              {candidateMembers.map((member, index) => (
                <div key={index} className="member-card">
                  <div className="member-info">
                    <span className="member-name">{member.name}</span>
                    <span className="member-role">{member.role}</span>
                  </div>
                  <p className="availability">◎ 가용: {member.availability}</p>
                  <p className="member-tags">{member.tags.join(" ")}</p>
                  <p className="affinity">
                    적합도 <span>{member.affinity}%</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="recommended-team">
              <h2>추천 팀 구성</h2>
              <span className="affinity-score">적합도 {90}%</span>
              <p>4명의 최적 팀 구성</p>
              <div className="team-members">
                {recommendedTeam.map((member, index) => (
                  <div key={index} className="team-member-card">
                    <span className="member-initial">
                      {member.name.charAt(0)}
                    </span>
                    <div className="member-details">
                      <p className="name">{member.name}</p>
                      <p className="role">{member.role}</p>
                      <p className="tags">
                        {member.tags.join(" ")} <span>{member.addition}</span>
                      </p>
                      <p className="affinity">
                        적합도 <span>{member.affinity}%</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TeamAutoMatching;
