import React, { useState, useEffect } from 'react';
import '../styles/Overview.css';

const Overview = (data) => {
    console.log("Data",data.Data)
    const [shopData, setShopData] = useState(data.Data);
    const [loading, setLoading] = useState(true);
    const [feedbacks, setFeedbacks] = useState([]);
    const [avgRating, setAvgRating] = useState(0);

    const renderStars = (rating) => {
        const fullStars = Math.floor(rating);
        const hasHalfStar = rating % 1 >= 0.5;
        const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
        const stars = [];

        // Full stars
        for (let i = 0; i < fullStars; i++) {
            stars.push(<i key={`full-${i}`} className="fa-solid fa-star" style={{ color: '#FFC107' }}></i>);
        }

        // Half star
        if (hasHalfStar) {
            stars.push(<i key="half" className="fa-solid fa-star-half-stroke" style={{ color: '#FFC107' }}></i>);
        }

        // Empty stars
        for (let i = 0; i < emptyStars; i++) {
            stars.push(<i key={`empty-${i}`} className="fa-regular fa-star" style={{ color: '#FFC107' }}></i>);
        }

        return <div style={{ display: 'flex', gap: '2px' }}>{stars}</div>;
    };

    useEffect(() => {
        if (shopData) {
            setLoading(false);   
        }
    }, []);

    useEffect(() => {
    if (!shopData) return;
    console.log("fetching avg ratings");
    const shopId = shopData.shop_id || shopData.id;
    if (!shopId) return;

    const fetchAvgRating = async () => {
        try {
            const token = localStorage.getItem('access_token');
            const response = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/api/owners/getAvgRatings`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        shop_id: shopId,
                    }),
                }
            );

            const data = await response.json();
            console.log("Avg api response",data)
            console.log(data.data)
            if (data.success && data.data !== null) {
                setAvgRating(parseFloat(data.data) || 0);
                console.log("avg ratings",avgRating)
            }
        } catch (error) {
            console.error("Error fetching average rating:", error);
        }
    };

    fetchAvgRating();
    }, [shopData]);

    useEffect(() => {
        if (!shopData) return;

        const shopId = shopData.shop_id || shopData.id;
        console.log("Using shopId:", shopId);

        if (!shopId) {
            console.log("No shop ID found in shopData");
            return;
        }

        const fetchFeedbacks = async () => {
            try {
                console.log("Fetching feedbacks...")
                const token = localStorage.getItem('access_token');
            const response = await fetch(
                `${import.meta.env.VITE_BACKEND_URL}/api/owners/getfeedbacks`,
                {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${token}`,
                        },
                        body: JSON.stringify({
                            shop_id: shopId,
                        }),
                    }
                );

                const data = await response.json();
                console.log("Feedbacks API response:", data);
                if (data.success && data.data) {
                    setFeedbacks(data.data);
                }
            } catch (error) {
                console.error("Error fetching feedbacks:", error);
            }
        };

        fetchFeedbacks();
    }, [shopData]);

    if (loading) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Loading shop data...</p>
            </div>
        );
    }

    if (!shopData) {
        return (
            <div className="error-container">
                <p>No shop data found. Please login again.</p>
            </div>
        );
    }

    return (
        <div>
            {/* Main Content */}
            <main className="main">
                <div className="content-grid">
                    {/* Left Column - Ratings & Feedback (40% width) */}
                    <div className="left-column">
                        {/* Ratings Section */}
                        <section className="section ratings-section">
                            <h2 className="section-title">Ratings & Reviews</h2>
                            <div className="ratings-container">
                                <div className="rating-overview">
                                    <div className="rating-big">{avgRating || 0}</div>
                                    <div className="rating-stars">{renderStars(avgRating || 0)}</div>
                                    <p className="rating-total">{feedbacks.length} reviews</p>
                                </div>
                                <div className="rating-breakdown">
                                    {[5, 4, 3, 2, 1].map((stars) => {
                                        const count = feedbacks.filter(f => Math.floor(f.ratings || 0) === stars).length;
                                        const percentage = feedbacks.length > 0 ? Math.round((count / feedbacks.length) * 100) : 0;
                                        return (
                                            <div key={stars} className="rating-row">
                                                <span className="rating-stars-text">{stars} ⭐</span>
                                                <div className="rating-bar">
                                                    <div
                                                        className="rating-fill"
                                                        style={{
                                                            width: `${percentage}%`,
                                                        }}
                                                    ></div>
                                                </div>
                                                <span className="rating-count">{count}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </section>

                        {/* Feedback Section */}
                        <section className="section feedback-section">
                            <h2 className="section-title">Recent Feedback</h2>
                            <div className="feedback-container">
                                <div className="feedback-wrapper">
                                    {feedbacks.length === 0 ? (
                                        <p className="no-feedback">No feedbacks yet</p>
                                    ) : (
                                        <>
                                            {/* Duplicate feedbacks for seamless scrolling */}
                                            {[...feedbacks, ...feedbacks, ...feedbacks].map((feedback, index) => (
                                                <div key={index} className="feedback-card">
                                                    <div className="feedback-header">
                                                        <span className="feedback-date">
                                                            {feedback.created_at ? new Date(feedback.created_at).toLocaleDateString() : 'N/A'}
                                                        </span>
                                                    </div>
                                                    <div className="feedback-stars">
                                                        {'⭐'.repeat(parseInt(feedback.ratings) || 0)}
                                                    </div>
                                                    <p className="feedback-comment">{feedback.feedback || 'No comment'}</p>
                                                </div>
                                            ))}
                                        </>
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Right Column - Analysis (60% width, full height) */}
                    <div className="right-column">
                        <section className="section analysis-section">
                            <h2 className="section-title">Analysis</h2>
                        </section>
                    </div>
                </div>
            </main>
        </div>
    )
}

export default Overview;

