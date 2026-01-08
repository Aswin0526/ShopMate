import React, {useState, useEffect} from 'react';

function Update(data){
    const shopData = data.Data;
    console.log("Recieved data in Update",shopData)
    const [loading, setLoading] = useState(true);
    const [logo, setLogo] = useState(null);
    const [shopImages, setShopImages] = useState({});

    useEffect(() => {
        if(shopData){
            setLoading(false);
            fetchLogo();
            fetchShopImages();
        }
    }, [shopData]);

    const fetchLogo = async () => {
        try {
            const response = await fetch('http://localhost:5000/api/owners/get-logo', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ shop_id: shopData.shop_id }),
            });
            const result = await response.json();
            if (result.success) {
                setLogo(result.data.logo);
            }
        } catch (err) {
            console.error('Error fetching logo:', err);
        }
    };

    const fetchShopImages = async () => {
        try {
            const response = await fetch('http://localhost:5000/api/owners/get-shop-images', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ shop_id: shopData.shop_id }),
            });
            const result = await response.json();
            if (result.success) {
                setShopImages(result.data);
            }
        } catch (err) {
            console.error('Error fetching shop images:', err);
        }
    };

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
                    {shopImages.pic1 && <img src={shopImages.pic1} alt="Shop 1" style={{ maxWidth: '200px', maxHeight: '200px' }} />}
                    {shopImages.pic2 && <img src={shopImages.pic2} alt="Shop 2" style={{ maxWidth: '200px', maxHeight: '200px' }} />}
                    {shopImages.pic3 && <img src={shopImages.pic3} alt="Shop 3" style={{ maxWidth: '200px', maxHeight: '200px' }} />}
                    {shopImages.pic4 && <img src={shopImages.pic4} alt="Shop 4" style={{ maxWidth: '200px', maxHeight: '200px' }} />}
                    {shopImages.pic5 && <img src={shopImages.pic5} alt="Shop 5" style={{ maxWidth: '200px', maxHeight: '200px' }} />}
                </div>
            </div>
        </div>
    )
}

export default Update;

