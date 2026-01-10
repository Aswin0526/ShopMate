import React, {useState} from 'react';

function Update({Data, logo, shopImages}){
    const shopData = Data;
    const [loading, setLoading] = useState(false);

    if (!shopData) {
        return (
            <div className="error-container">
                <p>No shop data found. Please login again.</p>
            </div>
        );
    }

    return (
        <div>
            <h2>Shop Images</h2>
            
            <div className="logo-section">
                <h3>Logo</h3>
                {logo ? (
                    <img src={logo} alt="Shop Logo" style={{ maxWidth: '200px', maxHeight: '200px' }} />
                ) : (
                    <p>No logo uploaded</p>
                )}
            </div>

            <div className="shop-images-section">
                <h3>Shop Images</h3>
                <div className="images-grid">
                    {shopImages && shopImages.pic1 && <img src={shopImages.pic1} alt="Shop 1" style={{ maxWidth: '200px', maxHeight: '200px' }} />}
                    {shopImages && shopImages.pic2 && <img src={shopImages.pic2} alt="Shop 2" style={{ maxWidth: '200px', maxHeight: '200px' }} />}
                    {shopImages && shopImages.pic3 && <img src={shopImages.pic3} alt="Shop 3" style={{ maxWidth: '200px', maxHeight: '200px' }} />}
                    {shopImages && shopImages.pic4 && <img src={shopImages.pic4} alt="Shop 4" style={{ maxWidth: '200px', maxHeight: '200px' }} />}
                    {shopImages && shopImages.pic5 && <img src={shopImages.pic5} alt="Shop 5" style={{ maxWidth: '200px', maxHeight: '200px' }} />}
                </div>
            </div>
        </div>
    )
}

export default Update;

