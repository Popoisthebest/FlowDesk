import React, { useMemo, useState } from "react";
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
      slots: ["오후"],
      tags: ["#AI", "#백엔드", "#데이터"],
      affinity: 88,
    },
    {
      name: "서현",
      role: "프론트엔드",
      availability: "오전 9-12시",
      slots: ["오전"],
      tags: ["#모바일", "#UI", "#UX"],
      affinity: 93,
    },
    {
      name: "지효",
      role: "프론트엔드",
      availability: "오후 2-7시",
      slots: ["오후"],
      tags: ["#앱", "#React"],
      affinity: 85,
    },
    {
      name: "은혁",
      role: "백엔드",
      availability: "야간 8-11시",
      slots: ["야간"],
      tags: ["#API", "#데이터"],
      affinity: 82,
    },

    {
      name: "하린",
      role: "디자인",
      availability: "오전 10-1시",
      slots: ["오전"],
      tags: ["#UI", "#UX", "#모바일"],
      affinity: 91,
    },
    {
      name: "윤아",
      role: "디자인",
      availability: "오후 1-6시",
      slots: ["오후"],
      tags: ["#UI", "#브랜딩", "#앱"],
      affinity: 87,
    },
    {
      name: "지안",
      role: "디자인",
      availability: "야간 7-10시",
      slots: ["야간"],
      tags: ["#UX", "#프로토타입", "#React"],
      affinity: 84,
    },

    {
      name: "도윤",
      role: "PM",
      availability: "오전 9-오후 3시",
      slots: ["오전", "오후"],
      tags: ["#UI", "#데이터", "#PM"],
      affinity: 89,
    },
  ];

  // 초기 샘플 추천 팀
  const baseRecommendedTeam = [
    {
      name: "서현",
      role: "PM",
      availability: "오전 9-12시",
      slots: ["오전"],
      tags: ["#앱", "#UI"],
      affinity: 93,
      addition: "+1",
    },
    {
      name: "지효",
      role: "프론트엔드",
      availability: "오후 2-7시",
      slots: ["오후"],
      tags: ["#앱", "#React"],
      affinity: 85,
      addition: "+1",
    },
  ];

  const [selectedRoles, setSelectedRoles] = useState([]);
  const [selectedSlots, setSelectedSlots] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);

  // 🔹 실제 추천 팀 상태 (초기에는 샘플 팀)
  const [recommendedTeam, setRecommendedTeam] = useState(baseRecommendedTeam);

  const toggle = (value, listSetter) => {
    listSetter((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  // 🔹 필터를 반영한 후보 멤버 리스트
  const filteredCandidates = useMemo(() => {
    return candidateMembers.filter((m) => {
      if (selectedRoles.length > 0 && !selectedRoles.includes(m.role)) {
        return false;
      }
      if (
        selectedSlots.length > 0 &&
        !selectedSlots.some((slot) => m.slots?.includes(slot))
      ) {
        return false;
      }
      if (
        selectedTags.length > 0 &&
        !selectedTags.some((tag) => m.tags?.includes(tag))
      ) {
        return false;
      }
      return true;
    });
  }, [candidateMembers, selectedRoles, selectedSlots, selectedTags]);

  // 🔹 추천 팀도 필터에 맞춰서 보여주기
  const filteredRecommended = useMemo(() => {
    return recommendedTeam.filter((m) => {
      if (selectedRoles.length > 0 && !selectedRoles.includes(m.role)) {
        return false;
      }
      if (
        selectedSlots.length > 0 &&
        !selectedSlots.some((slot) => m.slots?.includes(slot))
      ) {
        return false;
      }
      if (
        selectedTags.length > 0 &&
        !selectedTags.some((tag) => m.tags?.includes(tag))
      ) {
        return false;
      }
      return true;
    });
  }, [recommendedTeam, selectedRoles, selectedSlots, selectedTags]);

  // 🔹 추천 팀 평균 적합도
  const avgAffinity =
    filteredRecommended.length > 0
      ? Math.round(
          filteredRecommended.reduce((sum, m) => sum + m.affinity, 0) /
            filteredRecommended.length
        )
      : 0;

  // 🔹 멤버별 매칭 점수 계산 로직 (간단 가중치)
  const computeScore = (member) => {
    let score = member.affinity ?? 50;

    // 역할 매칭
    if (selectedRoles.length > 0 && selectedRoles.includes(member.role)) {
      score += 5;
    }

    // 시간대 매칭
    if (
      selectedSlots.length > 0 &&
      selectedSlots.some((slot) => member.slots?.includes(slot))
    ) {
      score += 5;
    }

    // 태그 매칭 개수만큼 가산
    if (selectedTags.length > 0) {
      const tagMatches = selectedTags.filter((tag) =>
        member.tags?.includes(tag)
      ).length;
      score += tagMatches * 3;
    }

    return score;
  };

  // 🔹 "추천 실행" 버튼 클릭 시, 추천 팀 재구성
  const runMatching = () => {
    // 필터 적용된 후보가 있으면 그 안에서 추천, 없으면 전체 후보에서 추천
    const pool =
      filteredCandidates.length > 0 ? filteredCandidates : candidateMembers;

    if (pool.length === 0) {
      setRecommendedTeam([]);
      return;
    }

    const scored = pool
      .map((m) => ({ ...m, _score: computeScore(m) }))
      .sort((a, b) => b._score - a._score);

    // 상위 3~4명만 추천 팀으로 선택
    const top = scored.slice(0, 4).map(({ _score, ...rest }) => rest);

    setRecommendedTeam(top);
  };

  return (
    <div className="team-auto-matching-container">
      <div className="team-matching-main">
        {/* 헤더 카드 */}
        <header className="tma-header">
          <div className="tma-header-left">
            <div className="tma-logo-puck">
              <span className="tma-logo-icon">👥</span>
            </div>
            <div>
              <h2 className="tma-title">팀 오토 매칭</h2>
              <p className="tma-subtitle">
                역할 · 시간대 · 선호 태그를 기반으로 최적 팀 구성을 추천합니다.
              </p>
            </div>
          </div>
          <button
            className="btn-primary tma-run-button"
            type="button"
            onClick={runMatching}
          >
            추천 실행
          </button>
        </header>

        {/* 2열 레이아웃: 필터 / 결과 */}
        <div className="tma-grid">
          {/* 왼쪽: 필터 카드 */}
          <section className="tma-filters-card">
            <h3 className="tma-section-title">매칭 조건</h3>
            <p className="tma-section-desc">
              역할, 시간대, 태그를 선택하면 오른쪽에서 추천 결과가 바로 업데이트
              됩니다.
            </p>

            <div className="tma-filter-group">
              <div className="tma-filter-label-row">
                <span>역할</span>
                {selectedRoles.length > 0 && (
                  <button
                    type="button"
                    className="tma-filter-reset"
                    onClick={() => setSelectedRoles([])}
                  >
                    초기화
                  </button>
                )}
              </div>
              <div className="tma-tags-row">
                {roles.map((role) => (
                  <button
                    key={role}
                    type="button"
                    className={
                      "tma-chip tma-chip-role" +
                      (selectedRoles.includes(role) ? " selected" : "")
                    }
                    onClick={() => toggle(role, setSelectedRoles)}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            <div className="tma-filter-group">
              <div className="tma-filter-label-row">
                <span>시간대</span>
                {selectedSlots.length > 0 && (
                  <button
                    type="button"
                    className="tma-filter-reset"
                    onClick={() => setSelectedSlots([])}
                  >
                    초기화
                  </button>
                )}
              </div>
              <div className="tma-tags-row">
                {timeSlots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    className={
                      "tma-chip tma-chip-time" +
                      (selectedSlots.includes(slot) ? " selected" : "")
                    }
                    onClick={() => toggle(slot, setSelectedSlots)}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>

            <div className="tma-filter-group">
              <div className="tma-filter-label-row">
                <span>선호 태그</span>
                {selectedTags.length > 0 && (
                  <button
                    type="button"
                    className="tma-filter-reset"
                    onClick={() => setSelectedTags([])}
                  >
                    초기화
                  </button>
                )}
              </div>
              <div className="tma-tags-row">
                {tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={
                      "tma-chip tma-chip-pref" +
                      (selectedTags.includes(tag) ? " selected" : "")
                    }
                    onClick={() => toggle(tag, setSelectedTags)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            <div className="tma-filter-summary">
              <p>
                <span>현재 조건</span>
              </p>
              <p className="tma-filter-badges">
                {selectedRoles.length === 0 &&
                selectedSlots.length === 0 &&
                selectedTags.length === 0 ? (
                  <span className="tma-filter-pill">전체 멤버 대상</span>
                ) : (
                  <>
                    {selectedRoles.length > 0 && (
                      <span className="tma-filter-pill">
                        역할: {selectedRoles.join(", ")}
                      </span>
                    )}
                    {selectedSlots.length > 0 && (
                      <span className="tma-filter-pill">
                        시간대: {selectedSlots.join(", ")}
                      </span>
                    )}
                    {selectedTags.length > 0 && (
                      <span className="tma-filter-pill">
                        태그: {selectedTags.join(", ")}
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>
          </section>

          {/* 오른쪽: 결과 카드 */}
          <section className="tma-results">
            {/* 후보 멤버 */}
            <div className="tma-card tma-candidate-card">
              <div className="tma-card-header">
                <h3>후보 멤버</h3>
                <span className="tma-count-badge">
                  {filteredCandidates.length}명
                </span>
              </div>
              <p className="tma-card-desc">
                조건에 맞는 후보 멤버가 여기에 표시됩니다.
              </p>
              <div className="tma-card-scroll">
                {filteredCandidates.length === 0 ? (
                  <p className="tma-empty">조건에 맞는 멤버가 없습니다.</p>
                ) : (
                  filteredCandidates.map((member, index) => (
                    <div key={index} className="member-card">
                      <div className="member-info">
                        <span className="member-name">{member.name}</span>
                        <span className="member-role-chip">{member.role}</span>
                      </div>
                      <p className="availability">
                        ◎ 가용: {member.availability}
                      </p>
                      <p className="member-tags">
                        {member.tags.map((t) => (
                          <span key={t}>{t} </span>
                        ))}
                      </p>
                      <p className="affinity">
                        적합도 <span>{member.affinity}%</span>
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 추천 팀 구성 */}
            <div className="tma-card tma-recommend-card">
              <div className="tma-card-header">
                <h3>추천 팀 구성</h3>
                <span className="tma-score-badge">
                  적합도 {avgAffinity || 0}%
                </span>
              </div>
              <p className="tma-card-desc">
                현재 조건을 기준으로 추천되는 팀 조합입니다.
              </p>
              <div className="tma-card-scroll">
                {filteredRecommended.length === 0 ? (
                  <p className="tma-empty">추천 가능한 팀 구성이 없습니다.</p>
                ) : (
                  filteredRecommended.map((member, index) => (
                    <div key={index} className="team-member-card">
                      <span className="member-initial">
                        {member.name.charAt(0)}
                      </span>
                      <div className="member-details">
                        <p className="name">
                          {member.name}
                          <span className="role">{member.role}</span>
                        </p>
                        <p className="availability">
                          가용: {member.availability}
                        </p>
                        <p className="tags">
                          {member.tags.join(" ")}{" "}
                          {member.addition && (
                            <span className="addition">{member.addition}</span>
                          )}
                        </p>
                        <p className="affinity">
                          적합도 <span>{member.affinity}%</span>
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TeamAutoMatching;
